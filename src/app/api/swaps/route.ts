import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cached, invalidateCache } from "@/lib/redis";

const shiftInclude = {
    select: {
        id: true, date: true, startTime: true, endTime: true, status: true,
        employee: {
            select: {
                id: true, fullName: true, userId: true,
                department: { select: { id: true, name: true } },
            },
        },
    },
};

// GET /api/swaps — Role-filtered swap request list (Redis cached)
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const cacheKey = `swaps:${session.user.role}:${session.user.id}`;

        const swaps = await cached(cacheKey, async () => {
            const role = session.user.role;

            if (role === "STAFF") {
                const employee = await prisma.employee.findUnique({ where: { userId: session.user.id } });
                if (!employee) return [];
                return prisma.shiftSwapRequest.findMany({
                    where: {
                        OR: [
                            { requesterShift: { employeeId: employee.id } },
                            { targetShift: { employeeId: employee.id } },
                        ],
                    },
                    include: { requesterShift: shiftInclude, targetShift: shiftInclude },
                    orderBy: { createdAt: "desc" },
                });
            }

            if (role === "MANAGER") {
                const manager = await prisma.employee.findUnique({ where: { userId: session.user.id } });
                if (!manager) return [];
                return prisma.shiftSwapRequest.findMany({
                    where: { requesterShift: { departmentId: manager.departmentId } },
                    include: { requesterShift: shiftInclude, targetShift: shiftInclude },
                    orderBy: { createdAt: "desc" },
                });
            }

            // ADMIN: all
            return prisma.shiftSwapRequest.findMany({
                include: { requesterShift: shiftInclude, targetShift: shiftInclude },
                orderBy: { createdAt: "desc" },
            });
        }, 30);

        return NextResponse.json(swaps);
    } catch (error) {
        console.error("Failed to fetch swaps:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// POST /api/swaps — Staff creates a swap request by entering colleague email
export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const employee = await prisma.employee.findUnique({ where: { userId: session.user.id } });
        if (!employee) return NextResponse.json({ error: "Employee profile not found" }, { status: 404 });

        const body = await request.json();
        const { requesterShiftId, targetEmail } = body;

        if (!requesterShiftId || !targetEmail) {
            return NextResponse.json(
                { error: "requesterShiftId and targetEmail are required" },
                { status: 400 }
            );
        }

        // 1. Verify requester owns the shift & it's published
        const reqShift = await prisma.shift.findUnique({ where: { id: requesterShiftId } });
        if (!reqShift || reqShift.employeeId !== employee.id) {
            return NextResponse.json({ error: "You can only swap your own shifts" }, { status: 403 });
        }
        if (reqShift.status !== "PUBLISHED") {
            return NextResponse.json({ error: "Can only swap published shifts" }, { status: 400 });
        }

        // 2. Find target employee by email
        const targetUser = await prisma.user.findUnique({
            where: { email: targetEmail.trim().toLowerCase() },
            include: { employee: true },
        });
        if (!targetUser || !targetUser.employee) {
            return NextResponse.json(
                { error: `No employee found with email "${targetEmail}"` },
                { status: 404 }
            );
        }
        const targetEmployee = targetUser.employee;

        if (targetEmployee.id === employee.id) {
            return NextResponse.json({ error: "Cannot swap with yourself" }, { status: 400 });
        }

        // 3. Find target's published shift on the same day
        const reqDate = new Date(reqShift.date);
        const dayStart = new Date(reqDate.getFullYear(), reqDate.getMonth(), reqDate.getDate());
        const dayEnd = new Date(reqDate.getFullYear(), reqDate.getMonth(), reqDate.getDate() + 1);

        const targetShift = await prisma.shift.findFirst({
            where: {
                employeeId: targetEmployee.id,
                status: "PUBLISHED",
                date: { gte: dayStart, lt: dayEnd },
            },
        });

        if (!targetShift) {
            return NextResponse.json(
                { error: `${targetUser.employee.fullName} doesn't have a published shift on ${reqDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` },
                { status: 400 }
            );
        }

        // 4. Check for existing pending swap between these shifts
        const existing = await prisma.shiftSwapRequest.findFirst({
            where: {
                OR: [
                    { requesterShiftId: reqShift.id, targetShiftId: targetShift.id },
                    { requesterShiftId: targetShift.id, targetShiftId: reqShift.id },
                ],
                status: { in: ["PENDING_TARGET", "PENDING_MANAGER"] },
            },
        });
        if (existing) {
            return NextResponse.json(
                { error: "A swap request already exists between these shifts" },
                { status: 409 }
            );
        }

        // 5. Create swap request
        const swap = await prisma.shiftSwapRequest.create({
            data: {
                requesterShiftId: reqShift.id,
                targetShiftId: targetShift.id,
            },
            include: {
                requesterShift: shiftInclude,
                targetShift: shiftInclude,
            },
        });

        await invalidateCache("swaps:");
        return NextResponse.json(swap, { status: 201 });
    } catch (error) {
        console.error("Failed to create swap:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
