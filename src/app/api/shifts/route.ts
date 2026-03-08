import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

// Build a cache key from query params
function buildCacheKey(
    departmentId?: string,
    startDate?: string,
    endDate?: string
) {
    const dept = departmentId || "all";
    const start = startDate || "none";
    const end = endDate || "none";
    return `shifts:dept:${dept}:dates:${start}-${end}`;
}

// GET /api/shifts — Role-filtered shift fetching with Cache-Aside
export async function GET(request: Request) {
    const session = await getServerSession(authOptions);

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const departmentId = searchParams.get("departmentId") || undefined;
        const startDate = searchParams.get("startDate") || undefined;
        const endDate = searchParams.get("endDate") || undefined;

        const role = session.user.role;

        // ─── Build base filter ───────────────────────────────────────
        const where: Record<string, unknown> = {};

        if (departmentId) {
            where.departmentId = departmentId;
        }

        if (startDate || endDate) {
            where.date = {};
            if (startDate) {
                (where.date as Record<string, unknown>).gte = new Date(startDate);
            }
            if (endDate) {
                (where.date as Record<string, unknown>).lte = new Date(endDate);
            }
        }

        // ─── STAFF: only their own PUBLISHED shifts ──────────────────
        if (role === "STAFF") {
            const employee = await prisma.employee.findUnique({
                where: { userId: session.user.id },
            });

            if (!employee) {
                return NextResponse.json([]);
            }

            // forSwap=true → return ALL published shifts in the dept (for swap target selection)
            const forSwap = searchParams.get("forSwap") === "true";
            if (forSwap) {
                where.departmentId = employee.departmentId;
                where.status = "PUBLISHED";
            } else {
                where.employeeId = employee.id;
                where.status = "PUBLISHED";
            }

            const shifts = await prisma.shift.findMany({
                where,
                include: {
                    employee: {
                        select: {
                            id: true,
                            fullName: true,
                            user: { select: { email: true } },
                        },
                    },
                    department: { select: { id: true, name: true } },
                },
                orderBy: [{ date: "asc" }, { startTime: "asc" }],
            });

            return NextResponse.json(shifts);
        }

        // ─── MANAGER: all PUBLISHED + own dept's DRAFT ───────────────
        if (role === "MANAGER") {
            const manager = await prisma.employee.findUnique({
                where: { userId: session.user.id },
            });

            if (!manager) {
                return NextResponse.json([]);
            }

            // Build an OR condition: PUBLISHED from anyone OR any status from own dept
            const baseDate = where.date || undefined;
            const baseDept = departmentId || undefined;

            const managerWhere = {
                AND: [
                    ...(baseDate ? [{ date: baseDate }] : []),
                    {
                        OR: [
                            // All published shifts (optionally dept-filtered)
                            {
                                status: "PUBLISHED" as const,
                                ...(baseDept ? { departmentId: baseDept } : {}),
                            },
                            // Own department drafts
                            {
                                departmentId: manager.departmentId,
                                status: "DRAFT" as const,
                            },
                        ],
                    },
                ],
            };

            const shifts = await prisma.shift.findMany({
                where: managerWhere,
                include: {
                    employee: {
                        select: {
                            id: true,
                            fullName: true,
                            user: { select: { email: true } },
                        },
                    },
                    department: { select: { id: true, name: true } },
                },
                orderBy: [{ date: "asc" }, { startTime: "asc" }],
            });

            return NextResponse.json(shifts);
        }

        // ─── ADMIN: all shifts (with caching) ────────────────────────
        const cacheKey = buildCacheKey(departmentId, startDate, endDate);

        // Try cache first
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                return NextResponse.json(cached);
            }
        } catch (cacheErr) {
            console.warn("Redis read failed:", cacheErr);
        }

        const shifts = await prisma.shift.findMany({
            where,
            include: {
                employee: {
                    select: {
                        id: true,
                        fullName: true,
                        user: { select: { email: true } },
                    },
                },
                department: { select: { id: true, name: true } },
            },
            orderBy: [{ date: "asc" }, { startTime: "asc" }],
        });

        // Cache for 24h
        try {
            await redis.set(cacheKey, JSON.stringify(shifts), { ex: 86400 });
        } catch (cacheErr) {
            console.warn("Redis write failed:", cacheErr);
        }

        return NextResponse.json(shifts);
    } catch (error) {
        console.error("Failed to fetch shifts:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

// POST /api/shifts — Create a new shift (ADMIN/MANAGER only)
// Includes the Conflict Engine + cache invalidation
export async function POST(request: Request) {
    const session = await getServerSession(authOptions);

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
        return NextResponse.json(
            { error: "Forbidden: Only ADMIN or MANAGER can create shifts" },
            { status: 403 }
        );
    }

    try {
        const body = await request.json();
        const { employeeId, departmentId, date, startTime, endTime } = body;

        if (!employeeId || !departmentId || !date || !startTime || !endTime) {
            return NextResponse.json(
                {
                    error:
                        "employeeId, departmentId, date, startTime, and endTime are required",
                },
                { status: 400 }
            );
        }

        const shiftDate = new Date(date);
        const shiftStart = new Date(startTime);
        const shiftEnd = new Date(endTime);

        if (
            isNaN(shiftDate.getTime()) ||
            isNaN(shiftStart.getTime()) ||
            isNaN(shiftEnd.getTime())
        ) {
            return NextResponse.json(
                { error: "Invalid date/time format" },
                { status: 400 }
            );
        }

        if (shiftEnd <= shiftStart) {
            return NextResponse.json(
                { error: "endTime must be after startTime" },
                { status: 400 }
            );
        }

        // Verify employee exists
        const employee = await prisma.employee.findUnique({
            where: { id: employeeId },
        });

        if (!employee) {
            return NextResponse.json(
                { error: "Employee not found" },
                { status: 404 }
            );
        }

        // MANAGER can only create shifts for their department
        if (session.user.role === "MANAGER") {
            const manager = await prisma.employee.findUnique({
                where: { userId: session.user.id },
            });
            if (!manager || employee.departmentId !== manager.departmentId) {
                return NextResponse.json(
                    { error: "Forbidden: You can only create shifts for your department" },
                    { status: 403 }
                );
            }
        }

        // Verify department exists
        const department = await prisma.department.findUnique({
            where: { id: departmentId },
        });

        if (!department) {
            return NextResponse.json(
                { error: "Department not found" },
                { status: 404 }
            );
        }

        // ── CONFLICT ENGINE ───────────────────────────────────────────
        const startOfDay = new Date(shiftDate);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(shiftDate);
        endOfDay.setUTCHours(23, 59, 59, 999);

        // 1. LEAVE CONFLICT CHECK
        const leaveConflict = await prisma.leaveRequest.findFirst({
            where: {
                employeeId,
                status: "APPROVED",
                startDate: { lte: endOfDay },
                endDate: { gte: startOfDay },
            },
            include: {
                employee: { select: { fullName: true } },
            },
        });

        if (leaveConflict) {
            return NextResponse.json(
                {
                    error: "Employee is on approved leave.",
                    details: {
                        leaveId: leaveConflict.id,
                        leaveStart: leaveConflict.startDate,
                        leaveEnd: leaveConflict.endDate,
                        employeeName: leaveConflict.employee.fullName,
                    },
                },
                { status: 409 }
            );
        }

        // 2. OVERLAP CONFLICT CHECK
        const overlapConflict = await prisma.shift.findFirst({
            where: {
                employeeId,
                date: { gte: startOfDay, lte: endOfDay },
                startTime: { lt: shiftEnd },
                endTime: { gt: shiftStart },
            },
            include: {
                employee: { select: { fullName: true } },
            },
        });

        if (overlapConflict) {
            return NextResponse.json(
                {
                    error: "Shift overlaps with an existing shift.",
                    details: {
                        conflictingShiftId: overlapConflict.id,
                        existingStart: overlapConflict.startTime,
                        existingEnd: overlapConflict.endTime,
                        employeeName: overlapConflict.employee.fullName,
                    },
                },
                { status: 409 }
            );
        }

        // ── CREATE SHIFT ──────────────────────────────────────────────
        const shift = await prisma.shift.create({
            data: {
                employeeId,
                departmentId,
                date: shiftDate,
                startTime: shiftStart,
                endTime: shiftEnd,
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        fullName: true,
                        user: { select: { email: true } },
                    },
                },
                department: { select: { id: true, name: true } },
            },
        });

        // ── CACHE INVALIDATION ────────────────────────────────────────
        try {
            const deptPattern = `shifts:dept:${departmentId}:*`;
            const allPattern = `shifts:dept:all:*`;
            const keys = [
                ...(await redis.keys(deptPattern)),
                ...(await redis.keys(allPattern)),
            ];
            if (keys.length > 0) await redis.del(...keys);
        } catch (cacheErr) {
            console.warn("Redis invalidation failed:", cacheErr);
        }

        return NextResponse.json(shift, { status: 201 });
    } catch (error) {
        console.error("Failed to create shift:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
