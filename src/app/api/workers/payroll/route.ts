import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { differenceInMinutes } from "date-fns";
import { Receiver } from "@upstash/qstash";

// Force dynamic — never try to statically analyze this route
export const dynamic = "force-dynamic";

// ─── OT Rule Types ──────────────────────────────────────
interface OTRule {
    type: "WEEKLY_HOURS" | "DAILY_HOURS" | "LATE_NIGHT";
    enabled: boolean;
    threshold?: number;
}

// ─── Runtime signature verification ─────────────────────
async function verifyQStashSignature(req: Request): Promise<boolean> {
    const signingKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
    const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

    if (!signingKey || !nextSigningKey) {
        console.warn("[PayrollWorker] No signing keys — skipping verification (dev mode)");
        return true; // Allow in dev
    }

    try {
        const receiver = new Receiver({
            currentSigningKey: signingKey,
            nextSigningKey: nextSigningKey,
        });

        const body = await req.clone().text();
        const signature = req.headers.get("upstash-signature") || "";

        await receiver.verify({
            signature,
            body,
        });
        return true;
    } catch (err) {
        console.error("[PayrollWorker] Signature verification failed:", err);
        return false;
    }
}

// ─── POST handler ────────────────────────────────────────
export async function POST(req: Request) {
    // Verify QStash signature at runtime
    const isValid = await verifyQStashSignature(req);
    if (!isValid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { payrollPeriodId, startDate, endDate, otRules, departmentId } = body;

        if (!payrollPeriodId || !startDate || !endDate) {
            console.error("[PayrollWorker] Missing required fields:", body);
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        // Parse OT rules
        const rules: OTRule[] = Array.isArray(otRules) ? otRules : [];
        const weeklyRule = rules.find((r: OTRule) => r.type === "WEEKLY_HOURS" && r.enabled);
        const dailyRule = rules.find((r: OTRule) => r.type === "DAILY_HOURS" && r.enabled);
        const lateNightRule = rules.find((r: OTRule) => r.type === "LATE_NIGHT" && r.enabled);

        const periodDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const periodWeeks = Math.max(1, periodDays / 7);

        // Build shift query
        const shiftWhere: Record<string, unknown> = {
            status: "PUBLISHED",
            date: { gte: start, lte: end },
        };
        if (departmentId) {
            shiftWhere.departmentId = departmentId;
        }

        const shifts = await prisma.shift.findMany({
            where: shiftWhere,
            include: { employee: true },
        });

        if (shifts.length === 0) {
            console.warn(`[PayrollWorker] No published shifts for period ${payrollPeriodId}`);
            return NextResponse.json({ message: "No shifts found, period stays DRAFT" });
        }

        // ─── Per-employee shift analysis ─────────────────────
        interface EmpData {
            totalMinutes: number;
            shiftsCount: number;
            dailyOtMinutes: number;
            lateNightOtMinutes: number;
        }
        const employeeData: Record<string, EmpData> = {};

        for (const shift of shifts) {
            const shiftStart = new Date(shift.startTime);
            const shiftEnd = new Date(shift.endTime);
            const totalMins = differenceInMinutes(shiftEnd, shiftStart);

            if (!employeeData[shift.employeeId]) {
                employeeData[shift.employeeId] = {
                    totalMinutes: 0, shiftsCount: 0,
                    dailyOtMinutes: 0, lateNightOtMinutes: 0,
                };
            }
            const ed = employeeData[shift.employeeId];
            ed.totalMinutes += totalMins;
            ed.shiftsCount++;

            // DAILY_HOURS rule
            if (dailyRule && dailyRule.threshold && dailyRule.threshold > 0) {
                const dailyThresholdMins = dailyRule.threshold * 60;
                if (totalMins > dailyThresholdMins) {
                    ed.dailyOtMinutes += (totalMins - dailyThresholdMins);
                }
            }

            // LATE_NIGHT rule
            if (lateNightRule && lateNightRule.threshold !== undefined && lateNightRule.threshold > 0) {
                const nightHour = lateNightRule.threshold;
                const nightStart = new Date(shiftStart.getTime());
                nightStart.setHours(nightHour, 0, 0, 0);

                if (shiftEnd > nightStart) {
                    const effectiveStart = shiftStart > nightStart ? shiftStart : nightStart;
                    const nightMins = differenceInMinutes(shiftEnd, effectiveStart);
                    if (nightMins > 0) {
                        ed.lateNightOtMinutes += nightMins;
                    }
                }
            }
        }

        // Fetch employee rates
        const employeeIds = Object.keys(employeeData);
        const employees = await prisma.employee.findMany({
            where: { id: { in: employeeIds } },
        });
        const empMap = Object.fromEntries(employees.map((e: any) => [e.id, e]));

        // ─── Create PayrollRecords ───────────────────────────
        const recordsData = employeeIds.map((empId) => {
            const emp = empMap[empId];
            const ed = employeeData[empId];
            const totalHours = Math.round((ed.totalMinutes / 60) * 100) / 100;

            let overtimeHours = 0;

            if (weeklyRule) {
                const maxWeekly = (emp.maxHoursPerWeek || 40) * periodWeeks;
                const weeklyOt = Math.max(0, totalHours - maxWeekly);
                overtimeHours = Math.max(overtimeHours, weeklyOt);
            }
            if (dailyRule) {
                const dailyOt = ed.dailyOtMinutes / 60;
                overtimeHours = Math.max(overtimeHours, dailyOt);
            }
            if (lateNightRule) {
                const nightOt = ed.lateNightOtMinutes / 60;
                overtimeHours = Math.max(overtimeHours, nightOt);
            }

            overtimeHours = Math.round(Math.min(overtimeHours, totalHours) * 100) / 100;
            const regularHours = Math.round(Math.max(0, totalHours - overtimeHours) * 100) / 100;

            const hourlyRate = emp.hourlyRate;
            const overtimeRate = Math.round(emp.hourlyRate * emp.overtimeMultiplier * 100) / 100;
            const grossPay = Math.round((regularHours * hourlyRate + overtimeHours * overtimeRate) * 100) / 100;

            return {
                payrollPeriodId,
                employeeId: empId,
                totalHours,
                regularHours,
                overtimeHours,
                hourlyRate,
                overtimeRate,
                grossPay,
                deductions: 0,
                netPay: grossPay,
                shiftsCount: ed.shiftsCount,
            };
        });

        // Batch insert records + update period status
        await prisma.$transaction([
            ...recordsData.map((data: any) =>
                prisma.payrollRecord.create({ data })
            ),
            prisma.payrollPeriod.update({
                where: { id: payrollPeriodId },
                data: { status: "CONFIRMED" },
            }),
        ]);

        console.log(`[PayrollWorker] ✓ Period ${payrollPeriodId} — ${recordsData.length} records created`);
        return NextResponse.json({ success: true, records: recordsData.length });
    } catch (error) {
        console.error("[PayrollWorker] Fatal error:", error);
        return NextResponse.json({ error: "Worker failed" }, { status: 500 });
    }
}
