import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Helper: check if MANAGER owns the employee's department
async function checkManagerDeptAccess(
    userId: string,
    targetDepartmentId: string
): Promise<boolean> {
    const manager = await prisma.employee.findUnique({
        where: { userId },
    });
    return !!manager && manager.departmentId === targetDepartmentId;
}

// DELETE /api/employees/[id] — Delete employee + associated user (ADMIN/MANAGER own dept only)
export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
        return NextResponse.json(
            { error: "Forbidden: Only ADMIN or MANAGER can delete employees" },
            { status: 403 }
        );
    }

    try {
        const { id } = await params;

        const employee = await prisma.employee.findUnique({
            where: { id },
            include: { user: { select: { id: true } } },
        });

        if (!employee) {
            return NextResponse.json(
                { error: "Employee not found" },
                { status: 404 }
            );
        }

        // MANAGER: can only delete employees in their own department
        if (session.user.role === "MANAGER") {
            const allowed = await checkManagerDeptAccess(
                session.user.id,
                employee.departmentId
            );
            if (!allowed) {
                return NextResponse.json(
                    { error: "Forbidden: You can only manage employees in your department" },
                    { status: 403 }
                );
            }
        }

        // Deleting the User cascades to Employee (onDelete: Cascade in schema)
        await prisma.user.delete({
            where: { id: employee.user.id },
        });

        return NextResponse.json({ message: "Employee deleted successfully" });
    } catch (error) {
        console.error("Failed to delete employee:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

// PATCH /api/employees/[id] — Update employee details (ADMIN/MANAGER own dept only)
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
        return NextResponse.json(
            { error: "Forbidden: Only ADMIN or MANAGER can edit employees" },
            { status: 403 }
        );
    }

    try {
        const { id } = await params;
        const body = await request.json();
        const { fullName, departmentId, role, maxHoursPerWeek, hourlyRate, overtimeMultiplier } = body;

        const employee = await prisma.employee.findUnique({
            where: { id },
            include: { user: { select: { id: true } } },
        });

        if (!employee) {
            return NextResponse.json(
                { error: "Employee not found" },
                { status: 404 }
            );
        }

        // MANAGER: can only edit employees in their own department
        if (session.user.role === "MANAGER") {
            const allowed = await checkManagerDeptAccess(
                session.user.id,
                employee.departmentId
            );
            if (!allowed) {
                return NextResponse.json(
                    { error: "Forbidden: You can only manage employees in your department" },
                    { status: 403 }
                );
            }
            // MANAGER cannot change role or department
            if (role && role !== "STAFF") {
                return NextResponse.json(
                    { error: "Forbidden: Managers can only assign STAFF role" },
                    { status: 403 }
                );
            }
            if (departmentId && departmentId !== employee.departmentId) {
                return NextResponse.json(
                    { error: "Forbidden: Managers cannot transfer employees to other departments" },
                    { status: 403 }
                );
            }
        }

        // Update employee + user role in a transaction
        const updated = await prisma.$transaction(async (tx) => {
            if (role) {
                const validRoles = ["ADMIN", "MANAGER", "STAFF"];
                if (!validRoles.includes(role)) {
                    throw new Error(`Invalid role: ${role}`);
                }
                await tx.user.update({
                    where: { id: employee.user.id },
                    data: { role },
                });
            }

            return tx.employee.update({
                where: { id },
                data: {
                    ...(fullName && { fullName }),
                    ...(departmentId && { departmentId }),
                    ...(maxHoursPerWeek !== undefined && { maxHoursPerWeek }),
                    ...(hourlyRate !== undefined && { hourlyRate: Number(hourlyRate) }),
                    ...(overtimeMultiplier !== undefined && { overtimeMultiplier: Number(overtimeMultiplier) }),
                },
                include: {
                    user: { select: { email: true, role: true } },
                    department: { select: { id: true, name: true } },
                },
            });
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error("Failed to update employee:", error);
        const message =
            error instanceof Error ? error.message : "Internal server error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
