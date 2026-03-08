import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cached, invalidateCache } from "@/lib/redis";

// GET /api/registrations — Role-filtered registration list (Redis cached)
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const cacheKey = `regs:${session.user.role}:${session.user.id}`;

        const regs = await cached(cacheKey, async () => {
            const role = session.user.role;

            if (role === "STAFF") {
                const employee = await prisma.employee.findUnique({ where: { userId: session.user.id } });
                if (!employee) return [];
                return prisma.shiftRegistration.findMany({
                    where: { employeeId: employee.id },
                    include: {
                        employee: { select: { fullName: true, department: { select: { name: true } } } },
                        template: { select: { name: true, startTime: true, endTime: true } },
                    },
                    orderBy: { createdAt: "desc" },
                });
            }

            if (role === "MANAGER") {
                const manager = await prisma.employee.findUnique({ where: { userId: session.user.id } });
                if (!manager) return [];
                return prisma.shiftRegistration.findMany({
                    where: { departmentId: manager.departmentId },
                    include: {
                        employee: { select: { fullName: true, department: { select: { name: true } } } },
                        template: { select: { name: true, startTime: true, endTime: true } },
                    },
                    orderBy: { createdAt: "desc" },
                });
            }

            // ADMIN: all
            return prisma.shiftRegistration.findMany({
                include: {
                    employee: { select: { fullName: true, department: { select: { name: true } } } },
                    template: { select: { name: true, startTime: true, endTime: true } },
                },
                orderBy: { createdAt: "desc" },
            });
        }, 30);

        return NextResponse.json(regs);
    } catch (error) {
        console.error("Failed to fetch registrations:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// POST /api/registrations — Staff submits a shift registration
export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const employee = await prisma.employee.findUnique({ where: { userId: session.user.id } });
        if (!employee) {
            return NextResponse.json({ error: "Employee profile not found" }, { status: 404 });
        }

        const body = await request.json();
        const { date, templateId } = body;

        if (!date || !templateId) {
            return NextResponse.json({ error: "date and templateId are required" }, { status: 400 });
        }

        // Prevent registering for past or current dates
        const regDate = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (regDate <= today) {
            return NextResponse.json(
                { error: `Cannot register for ${regDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — only future dates allowed` },
                { status: 400 }
            );
        }

        // Verify template exists and belongs to employee's department
        const template = await prisma.shiftTemplate.findUnique({ where: { id: templateId } });
        if (!template || template.departmentId !== employee.departmentId) {
            return NextResponse.json({ error: "Invalid template for your department" }, { status: 400 });
        }

        // Check duplicate
        const existing = await prisma.shiftRegistration.findFirst({
            where: {
                employeeId: employee.id,
                date: new Date(date),
                templateId,
                status: "PENDING",
            },
        });
        if (existing) {
            return NextResponse.json({ error: "You already registered for this slot" }, { status: 409 });
        }

        const reg = await prisma.shiftRegistration.create({
            data: {
                employeeId: employee.id,
                departmentId: employee.departmentId,
                date: new Date(date),
                templateId,
            },
            include: {
                employee: { select: { fullName: true, department: { select: { name: true } } } },
                template: { select: { name: true, startTime: true, endTime: true } },
            },
        });

        await invalidateCache("regs:");
        return NextResponse.json(reg, { status: 201 });
    } catch (error) {
        console.error("Failed to create registration:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
