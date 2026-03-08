import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/redis";

// PATCH /api/registrations/[id] — Manager approves/rejects (auto-creates shift on approve)
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (session.user.role === "STAFF") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const { id } = await params;
        const body = await request.json();
        const { status } = body;

        if (!status || !["APPROVED", "REJECTED"].includes(status)) {
            return NextResponse.json({ error: "status must be APPROVED or REJECTED" }, { status: 400 });
        }

        const reg = await prisma.shiftRegistration.findUnique({
            where: { id },
            include: { template: true },
        });

        if (!reg) {
            return NextResponse.json({ error: "Registration not found" }, { status: 404 });
        }

        if (reg.status !== "PENDING") {
            return NextResponse.json({ error: `Already ${reg.status.toLowerCase()}` }, { status: 400 });
        }

        // MANAGER scope check
        if (session.user.role === "MANAGER") {
            const manager = await prisma.employee.findUnique({ where: { userId: session.user.id } });
            if (!manager || manager.departmentId !== reg.departmentId) {
                return NextResponse.json({ error: "Forbidden: not your department" }, { status: 403 });
            }
        }

        if (status === "APPROVED") {
            // Auto-create a DRAFT shift from the registration
            const shiftDate = new Date(reg.date);
            const dateStr = shiftDate.toISOString().split("T")[0];
            const shiftStart = new Date(`${dateStr}T${reg.template.startTime}:00`);
            const shiftEnd = new Date(`${dateStr}T${reg.template.endTime}:00`);

            await prisma.shift.create({
                data: {
                    employeeId: reg.employeeId,
                    departmentId: reg.departmentId,
                    date: shiftDate,
                    startTime: shiftStart,
                    endTime: shiftEnd,
                    status: "DRAFT",
                },
            });
        }

        const updated = await prisma.shiftRegistration.update({
            where: { id },
            data: { status },
            include: {
                employee: { select: { fullName: true, department: { select: { name: true } } } },
                template: { select: { name: true, startTime: true, endTime: true } },
            },
        });

        await invalidateCache("regs:", "shifts:");
        return NextResponse.json(updated);
    } catch (error) {
        console.error("Failed to update registration:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// DELETE /api/registrations/[id] — Staff cancels own PENDING registration
export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { id } = await params;

        const reg = await prisma.shiftRegistration.findUnique({
            where: { id },
            include: { employee: { select: { userId: true } } },
        });

        if (!reg) {
            return NextResponse.json({ error: "Registration not found" }, { status: 404 });
        }

        if (reg.employee.userId !== session.user.id && session.user.role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        if (reg.status !== "PENDING") {
            return NextResponse.json({ error: "Can only cancel pending registrations" }, { status: 400 });
        }

        await prisma.shiftRegistration.delete({ where: { id } });
        await invalidateCache("regs:");
        return NextResponse.json({ message: "Registration cancelled" });
    } catch (error) {
        console.error("Failed to delete registration:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
