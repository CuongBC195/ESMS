import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cached, invalidateCache } from "@/lib/redis";

// GET /api/leaves — Fetch leave requests (Redis cached, 30s)
export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const cacheKey = `leaves:${session.user.role}:${session.user.id}`;

        const leaveRequests = await cached(cacheKey, async () => {
            const role = session.user.role;
            const leaveInclude = {
                employee: {
                    select: {
                        id: true,
                        fullName: true,
                        department: { select: { id: true, name: true } },
                    },
                },
            };

            if (role === "ADMIN") {
                return prisma.leaveRequest.findMany({
                    include: leaveInclude,
                    orderBy: { createdAt: "desc" },
                });
            }

            const employee = await prisma.employee.findUnique({
                where: { userId: session.user.id },
            });

            if (!employee) return [];

            const isStaff = role === "STAFF";
            return prisma.leaveRequest.findMany({
                where: isStaff
                    ? { employeeId: employee.id }
                    : { employee: { departmentId: employee.departmentId } },
                include: leaveInclude,
                orderBy: { createdAt: "desc" },
            });
        }, 30);

        return NextResponse.json(leaveRequests);
    } catch (error) {
        console.error("Failed to fetch leave requests:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

// POST /api/leaves — Employee creates a new leave request
export async function POST(request: Request) {
    const session = await getServerSession(authOptions);

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const employee = await prisma.employee.findUnique({
            where: { userId: session.user.id },
        });

        if (!employee) {
            return NextResponse.json(
                {
                    error:
                        "Employee profile not found. Please ask an admin to create your employee profile first.",
                },
                { status: 404 }
            );
        }

        const body = await request.json();
        const { startDate, endDate, reason } = body;

        if (!startDate || !endDate) {
            return NextResponse.json(
                { error: "startDate and endDate are required" },
                { status: 400 }
            );
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return NextResponse.json(
                { error: "Invalid date format" },
                { status: 400 }
            );
        }

        if (end < start) {
            return NextResponse.json(
                { error: "endDate must be on or after startDate" },
                { status: 400 }
            );
        }

        // Prevent past-date leaves
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (start < today) {
            return NextResponse.json(
                { error: "Cannot create leave requests for past dates" },
                { status: 400 }
            );
        }

        const leaveRequest = await prisma.leaveRequest.create({
            data: {
                employeeId: employee.id,
                startDate: start,
                endDate: end,
                reason: reason || null,
            },
            include: {
                employee: {
                    select: {
                        fullName: true,
                        department: { select: { name: true } },
                    },
                },
            },
        });

        await invalidateCache("leaves:", "stats:");
        return NextResponse.json(leaveRequest, { status: 201 });
    } catch (error) {
        console.error("Failed to create leave request:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
