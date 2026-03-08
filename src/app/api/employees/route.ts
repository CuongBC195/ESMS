import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { hash } from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cached, invalidateCache } from "@/lib/redis";

// GET /api/employees — Role-filtered employee list (Redis cached)
export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const role = session.user.role;
        const cacheKey = `employees:${role}:${session.user.id}`;

        const employees = await cached(cacheKey, async () => {
            let departmentFilter: { departmentId?: string } = {};
            if (role === "MANAGER") {
                const manager = await prisma.employee.findUnique({
                    where: { userId: session.user.id },
                });
                if (manager) {
                    departmentFilter = { departmentId: manager.departmentId };
                }
            }

            return prisma.employee.findMany({
                where: departmentFilter,
                include: {
                    user: { select: { email: true, role: true } },
                    department: { select: { id: true, name: true } },
                },
                orderBy: { fullName: "asc" },
            });
        });

        return NextResponse.json(employees);
    } catch (error) {
        console.error("Failed to fetch employees:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

// POST /api/employees — Create Employee + User (ADMIN/MANAGER only)
export async function POST(request: Request) {
    const session = await getServerSession(authOptions);

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
        return NextResponse.json(
            { error: "Forbidden: Only ADMIN or MANAGER can create employees" },
            { status: 403 }
        );
    }

    try {
        const body = await request.json();
        const { email, password, fullName, role, departmentId, maxHoursPerWeek, hourlyRate, overtimeMultiplier } =
            body;

        if (!email || !password || !fullName || !departmentId) {
            return NextResponse.json(
                { error: "email, password, fullName, and departmentId are required" },
                { status: 400 }
            );
        }

        const validRoles = ["ADMIN", "MANAGER", "STAFF"];
        if (role && !validRoles.includes(role)) {
            return NextResponse.json(
                { error: `Invalid role. Must be one of: ${validRoles.join(", ")}` },
                { status: 400 }
            );
        }

        // MANAGER: can only add to their own department, and only STAFF role
        if (session.user.role === "MANAGER") {
            const manager = await prisma.employee.findUnique({
                where: { userId: session.user.id },
            });
            if (!manager || manager.departmentId !== departmentId) {
                return NextResponse.json(
                    {
                        error:
                            "Forbidden: You can only add employees to your own department",
                    },
                    { status: 403 }
                );
            }
            if (role && role !== "STAFF") {
                return NextResponse.json(
                    { error: "Forbidden: Managers can only create STAFF accounts" },
                    { status: 403 }
                );
            }
        }

        // Check if email already exists
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return NextResponse.json(
                { error: "A user with this email already exists" },
                { status: 409 }
            );
        }

        // Check if department exists
        const department = await prisma.department.findUnique({
            where: { id: departmentId },
        });

        if (!department) {
            return NextResponse.json(
                { error: "Department not found" },
                { status: 404 }
            );
        }

        const passwordHash = await hash(password, 12);

        const result = await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    email,
                    passwordHash,
                    role: role || "STAFF",
                },
            });

            const employee = await tx.employee.create({
                data: {
                    userId: user.id,
                    departmentId,
                    fullName,
                    maxHoursPerWeek: maxHoursPerWeek || 40,
                    hourlyRate: hourlyRate || 0,
                    overtimeMultiplier: overtimeMultiplier || 1.5,
                },
                include: {
                    user: {
                        select: { email: true, role: true },
                    },
                    department: {
                        select: { id: true, name: true },
                    },
                },
            });

            return employee;
        });

        await invalidateCache("employees:");
        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        console.error("Failed to create employee:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
