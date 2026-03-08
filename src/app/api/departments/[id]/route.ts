import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH /api/departments/[id] — Edit department (ADMIN only)
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
        return NextResponse.json(
            { error: "Forbidden: Only ADMIN can edit departments" },
            { status: 403 }
        );
    }

    try {
        const { id } = await params;
        const body = await request.json();
        const { name, shiftTemplates } = body;

        const dept = await prisma.department.findUnique({ where: { id } });
        if (!dept) {
            return NextResponse.json(
                { error: "Department not found" },
                { status: 404 }
            );
        }

        // If shiftTemplates provided, delete old ones and create new ones
        if (shiftTemplates && Array.isArray(shiftTemplates)) {
            await prisma.shiftTemplate.deleteMany({
                where: { departmentId: id },
            });

            if (shiftTemplates.length > 0) {
                await prisma.shiftTemplate.createMany({
                    data: shiftTemplates.map(
                        (t: { name: string; startTime: string; endTime: string }) => ({
                            departmentId: id,
                            name: t.name.trim(),
                            startTime: t.startTime,
                            endTime: t.endTime,
                        })
                    ),
                });
            }
        }

        const updated = await prisma.department.update({
            where: { id },
            data: {
                ...(name && { name: name.trim() }),
            },
            include: {
                _count: { select: { employees: true } },
                shiftTemplates: {
                    orderBy: { startTime: "asc" },
                },
            },
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error("Failed to update department:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

// DELETE /api/departments/[id] — Delete department (ADMIN only, only if empty)
export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
        return NextResponse.json(
            { error: "Forbidden: Only ADMIN can delete departments" },
            { status: 403 }
        );
    }

    try {
        const { id } = await params;

        const dept = await prisma.department.findUnique({
            where: { id },
            include: { _count: { select: { employees: true, shifts: true } } },
        });

        if (!dept) {
            return NextResponse.json(
                { error: "Department not found" },
                { status: 404 }
            );
        }

        if (dept._count.employees > 0) {
            return NextResponse.json(
                {
                    error: `Cannot delete: ${dept._count.employees} employee(s) still assigned. Reassign them first.`,
                },
                { status: 409 }
            );
        }

        // Delete templates first (cascade), then the department
        await prisma.shiftTemplate.deleteMany({ where: { departmentId: id } });
        await prisma.shift.deleteMany({ where: { departmentId: id } });
        await prisma.department.delete({ where: { id } });

        return NextResponse.json({ message: "Department deleted" });
    } catch (error) {
        console.error("Failed to delete department:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
