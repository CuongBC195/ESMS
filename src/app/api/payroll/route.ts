import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { qstashClient } from "@/lib/qstash";
import { cached, invalidateCache } from "@/lib/redis";
import { differenceInMinutes } from "date-fns";

// GET /api/payroll — List payroll periods (role-scoped)
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const role = session.user.role;
        const cacheKey = `payroll:${role}:${session.user.id}`;

        const data = await cached(cacheKey, async () => {
            if (role === "STAFF") {
                const employee = await prisma.employee.findUnique({ where: { userId: session.user.id } });
                if (!employee) return [];

                const records = await prisma.payrollRecord.findMany({
                    where: { employeeId: employee.id },
                    include: {
                        payrollPeriod: { select: { id: true, startDate: true, endDate: true, status: true, createdAt: true } },
                    },
                    orderBy: { payrollPeriod: { startDate: "desc" } },
                });

                return records.map((r: any) => ({
                    ...r.payrollPeriod,
                    myRecord: {
                        totalHours: r.totalHours,
                        regularHours: r.regularHours,
                        overtimeHours: r.overtimeHours,
                        grossPay: r.grossPay,
                        deductions: r.deductions,
                        netPay: r.netPay,
                        shiftsCount: r.shiftsCount,
                    },
                }));
            }

            if (role === "MANAGER") {
                const manager = await prisma.employee.findUnique({ where: { userId: session.user.id } });
                if (!manager) return [];
                const periods = await prisma.payrollPeriod.findMany({
                    include: {
                        records: {
                            where: { employee: { departmentId: manager.departmentId } },
                            include: { employee: { select: { fullName: true, department: { select: { name: true } } } } },
                        },
                        _count: { select: { records: true } },
                    },
                    orderBy: { startDate: "desc" },
                });
                return periods.filter((p: any) => p.records.length > 0);
            }

            // ADMIN
            const periods = await prisma.payrollPeriod.findMany({
                include: {
                    records: {
                        include: { employee: { select: { fullName: true, department: { select: { name: true } } } } },
                    },
                    _count: { select: { records: true } },
                },
                orderBy: { startDate: "desc" },
            });
            return periods;
        }, 30);

        return NextResponse.json(data);
    } catch (error) {
        console.error("Failed to fetch payroll:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// ─── OT Rule Types ──────────────────────────────────────
interface OTRule {
    type: "WEEKLY_HOURS" | "DAILY_HOURS" | "LATE_NIGHT";
    enabled: boolean;
    threshold?: number;
}

// POST /api/payroll — Async producer: create period + enqueue to QStash
export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (session.user.role === "STAFF") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { startDate, endDate, otRules } = body;

        if (!startDate || !endDate) {
            return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (end <= start) {
            return NextResponse.json({ error: "End date must be after start date" }, { status: 400 });
        }

        // Resolve departmentId for MANAGER scope
        let departmentId: string | undefined;
        if (session.user.role === "MANAGER") {
            const manager = await prisma.employee.findUnique({ where: { userId: session.user.id } });
            if (!manager) return NextResponse.json({ error: "Manager profile not found" }, { status: 404 });
            departmentId = manager.departmentId;
        }

        // 1. Create PayrollPeriod with status DRAFT
        const period = await prisma.payrollPeriod.create({
            data: { startDate: start, endDate: end, status: "DRAFT" },
        });

        // 2. Build the job payload
        const jobPayload = {
            payrollPeriodId: period.id,
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            otRules: otRules || [],
            departmentId,
        };

        // 3. Publish to QStash (or fallback to sync if no QStash configured)
        if (qstashClient) {
            const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
            await qstashClient.publishJSON({
                url: `${baseUrl}/api/workers/payroll`,
                body: jobPayload,
            });

            await invalidateCache("payroll:");

            return NextResponse.json(
                { id: period.id, status: "DRAFT", message: "Payroll calculation queued" },
                { status: 202 }
            );
        }

        // ─── Synchronous fallback (local dev without QStash) ─────
        const rules: OTRule[] = Array.isArray(otRules) ? otRules : [];
        const weeklyRule = rules.find((r) => r.type === "WEEKLY_HOURS" && r.enabled);
        const dailyRule = rules.find((r) => r.type === "DAILY_HOURS" && r.enabled);
        const lateNightRule = rules.find((r) => r.type === "LATE_NIGHT" && r.enabled);

        const periodDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const periodWeeks = Math.max(1, periodDays / 7);

        const shiftWhere: Record<string, unknown> = {
            status: "PUBLISHED",
            date: { gte: start, lte: end },
        };
        if (departmentId) shiftWhere.departmentId = departmentId;

        const shifts = await prisma.shift.findMany({
            where: shiftWhere,
            include: { employee: true },
        });

        if (shifts.length === 0) {
            await prisma.payrollPeriod.delete({ where: { id: period.id } });
            return NextResponse.json({ error: "No published shifts found in this period" }, { status: 400 });
        }

        interface EmpData { totalMinutes: number; shiftsCount: number; dailyOtMinutes: number; lateNightOtMinutes: number; }
        const employeeData: Record<string, EmpData> = {};

        for (const shift of shifts) {
            const shiftStart = new Date(shift.startTime);
            const shiftEnd = new Date(shift.endTime);
            const totalMins = differenceInMinutes(shiftEnd, shiftStart);

            if (!employeeData[shift.employeeId]) {
                employeeData[shift.employeeId] = { totalMinutes: 0, shiftsCount: 0, dailyOtMinutes: 0, lateNightOtMinutes: 0 };
            }
            const ed = employeeData[shift.employeeId];
            ed.totalMinutes += totalMins;
            ed.shiftsCount++;

            if (dailyRule && dailyRule.threshold && dailyRule.threshold > 0) {
                const dailyThresholdMins = dailyRule.threshold * 60;
                if (totalMins > dailyThresholdMins) ed.dailyOtMinutes += (totalMins - dailyThresholdMins);
            }

            if (lateNightRule && lateNightRule.threshold !== undefined && lateNightRule.threshold > 0) {
                const nightHour = lateNightRule.threshold;
                const nightStart = new Date(shiftStart.getTime());
                nightStart.setHours(nightHour, 0, 0, 0);
                if (shiftEnd > nightStart) {
                    const effectiveStart = shiftStart > nightStart ? shiftStart : nightStart;
                    const nightMins = differenceInMinutes(shiftEnd, effectiveStart);
                    if (nightMins > 0) ed.lateNightOtMinutes += nightMins;
                }
            }
        }

        const employeeIds = Object.keys(employeeData);
        const employees = await prisma.employee.findMany({ where: { id: { in: employeeIds } } });
        const empMap = Object.fromEntries(employees.map((e: any) => [e.id, e]));

        const updatedPeriod = await prisma.payrollPeriod.update({
            where: { id: period.id },
            data: {
                status: "CONFIRMED",
                records: {
                    create: employeeIds.map((empId) => {
                        const emp = empMap[empId];
                        const ed = employeeData[empId];
                        const totalHours = Math.round((ed.totalMinutes / 60) * 100) / 100;

                        let overtimeHours = 0;
                        if (weeklyRule) {
                            const maxWeekly = (emp.maxHoursPerWeek || 40) * periodWeeks;
                            overtimeHours = Math.max(overtimeHours, Math.max(0, totalHours - maxWeekly));
                        }
                        if (dailyRule) overtimeHours = Math.max(overtimeHours, ed.dailyOtMinutes / 60);
                        if (lateNightRule) overtimeHours = Math.max(overtimeHours, ed.lateNightOtMinutes / 60);

                        overtimeHours = Math.round(Math.min(overtimeHours, totalHours) * 100) / 100;
                        const regularHours = Math.round(Math.max(0, totalHours - overtimeHours) * 100) / 100;
                        const hourlyRate = emp.hourlyRate;
                        const overtimeRate = Math.round(emp.hourlyRate * emp.overtimeMultiplier * 100) / 100;
                        const grossPay = Math.round((regularHours * hourlyRate + overtimeHours * overtimeRate) * 100) / 100;

                        return {
                            employeeId: empId, totalHours, regularHours, overtimeHours,
                            hourlyRate, overtimeRate, grossPay, deductions: 0, netPay: grossPay,
                            shiftsCount: ed.shiftsCount,
                        };
                    }),
                },
            },
            include: {
                records: {
                    include: { employee: { select: { fullName: true, department: { select: { name: true } } } } },
                },
                _count: { select: { records: true } },
            },
        });

        await invalidateCache("payroll:");
        return NextResponse.json(updatedPeriod, { status: 201 });
    } catch (error) {
        console.error("Failed to generate payroll:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

