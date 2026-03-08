import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/redis";

// GET /api/stats — Role-scoped dashboard stats + chart data
export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const role = session.user.role;
        const cacheKey = `stats:${role}:${session.user.id}`;

        const statsData = await cached(cacheKey, async () => {
            // Calculate current week boundaries
            const now = new Date();
            const dayOfWeek = now.getDay();
            const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() + diffToMonday);
            weekStart.setHours(0, 0, 0, 0);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            weekEnd.setHours(23, 59, 59, 999);

            const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

            // Build per-day shift counts for the week
            async function getWeeklyDistribution(whereFilter: Record<string, unknown> = {}) {
                const shifts = await prisma.shift.findMany({
                    where: { date: { gte: weekStart, lte: weekEnd }, ...whereFilter },
                    select: { date: true },
                });
                const counts = dayNames.map(() => 0);
                shifts.forEach((s: any) => {
                    const d = new Date(s.date);
                    const idx = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
                    counts[idx]++;
                });
                return dayNames.map((name, i) => ({ day: name, shifts: counts[i] }));
            }

            // Recent activity: latest registrations, swaps, leaves
            async function getRecentActivity(whereFilter: Record<string, unknown> = {}) {
                const [recentRegs, recentSwaps, recentLeaves] = await Promise.all([
                    prisma.shiftRegistration.findMany({
                        where: whereFilter,
                        orderBy: { createdAt: "desc" },
                        take: 5,
                        select: {
                            id: true, status: true, createdAt: true,
                            employee: { select: { fullName: true } },
                        },
                    }),
                    prisma.shiftSwapRequest.findMany({
                        orderBy: { createdAt: "desc" },
                        take: 5,
                        select: {
                            id: true, status: true, createdAt: true,
                            requesterShift: { select: { employee: { select: { fullName: true } } } },
                        },
                    }),
                    prisma.leaveRequest.findMany({
                        where: whereFilter,
                        orderBy: { createdAt: "desc" },
                        take: 5,
                        select: {
                            id: true, status: true, createdAt: true,
                            employee: { select: { fullName: true } },
                        },
                    }),
                ]);

                type ActivityItem = { id: string; type: string; user: string; status: string; time: string };
                const items: ActivityItem[] = [];

                recentRegs.forEach((r: any) => items.push({
                    id: r.id, type: "registration", user: r.employee.fullName,
                    status: r.status, time: r.createdAt.toISOString(),
                }));
                recentSwaps.forEach((s: any) => items.push({
                    id: s.id, type: "swap", user: s.requesterShift.employee.fullName,
                    status: s.status, time: s.createdAt.toISOString(),
                }));
                recentLeaves.forEach((l: any) => items.push({
                    id: l.id, type: "leave", user: l.employee.fullName,
                    status: l.status, time: l.createdAt.toISOString(),
                }));

                items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
                return items.slice(0, 8);
            }

            // ─── STAFF: personal stats ───────────────────────────────────
            if (role === "STAFF") {
                const employee = await prisma.employee.findUnique({
                    where: { userId: session.user.id },
                });

                if (!employee) {
                    return {
                        type: "personal",
                        myShiftsThisWeek: 0,
                        myPendingLeaves: 0,
                        nextShift: null,
                        weeklyDistribution: dayNames.map((d: string) => ({ day: d, shifts: 0 })),
                    };
                }

                const [myShiftsThisWeek, myPendingLeaves, nextShiftResult, weeklyDistribution] =
                    await Promise.all([
                        prisma.shift.count({
                            where: {
                                employeeId: employee.id,
                                status: "PUBLISHED",
                                date: { gte: weekStart, lte: weekEnd },
                            },
                        }),
                        prisma.leaveRequest.count({
                            where: { employeeId: employee.id, status: "PENDING" },
                        }),
                        prisma.shift.findFirst({
                            where: {
                                employeeId: employee.id,
                                status: "PUBLISHED",
                                date: { gte: now },
                            },
                            orderBy: { date: "asc" },
                            select: { date: true, startTime: true, endTime: true },
                        }),
                        getWeeklyDistribution({ employeeId: employee.id, status: "PUBLISHED" }),
                    ]);

                return {
                    type: "personal",
                    myShiftsThisWeek,
                    myPendingLeaves,
                    nextShift: nextShiftResult,
                    weeklyDistribution,
                };
            }

            // ─── MANAGER: department-scoped stats ────────────────────────
            if (role === "MANAGER") {
                const manager = await prisma.employee.findUnique({
                    where: { userId: session.user.id },
                    include: { department: { select: { name: true } } },
                });

                if (!manager) {
                    return {
                        type: "department",
                        departmentName: "Unknown",
                        deptEmployees: 0,
                        deptShiftsThisWeek: 0,
                        deptPendingLeaves: 0,
                        weeklyDistribution: dayNames.map((d: string) => ({ day: d, shifts: 0 })),
                        recentActivity: [],
                    };
                }

                const [deptEmployees, deptShiftsThisWeek, deptPendingLeaves, weeklyDistribution, recentActivity] =
                    await Promise.all([
                        prisma.employee.count({
                            where: { departmentId: manager.departmentId },
                        }),
                        prisma.shift.count({
                            where: {
                                departmentId: manager.departmentId,
                                date: { gte: weekStart, lte: weekEnd },
                            },
                        }),
                        prisma.leaveRequest.count({
                            where: {
                                status: "PENDING",
                                employee: { departmentId: manager.departmentId },
                            },
                        }),
                        getWeeklyDistribution({ departmentId: manager.departmentId }),
                        getRecentActivity({ employee: { departmentId: manager.departmentId } }),
                    ]);

                return {
                    type: "department",
                    departmentName: manager.department.name,
                    deptEmployees,
                    deptShiftsThisWeek,
                    deptPendingLeaves,
                    weeklyDistribution,
                    recentActivity,
                };
            }

            // ─── ADMIN: system-wide stats ────────────────────────────────
            const [employeeCount, departmentCount, shiftsThisWeek, pendingLeaves, weeklyDistribution, recentActivity] =
                await Promise.all([
                    prisma.employee.count(),
                    prisma.department.count(),
                    prisma.shift.count({
                        where: { date: { gte: weekStart, lte: weekEnd } },
                    }),
                    prisma.leaveRequest.count({ where: { status: "PENDING" } }),
                    getWeeklyDistribution(),
                    getRecentActivity(),
                ]);

            return {
                type: "system",
                employeeCount,
                departmentCount,
                shiftsThisWeek,
                pendingLeaves,
                weeklyDistribution,
                recentActivity,
            };
        }, 30); // 30s cache

        return NextResponse.json(statsData);
    } catch (error) {
        console.error("Failed to fetch stats:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
