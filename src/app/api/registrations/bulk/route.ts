import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/redis";

// PATCH /api/registrations/bulk — Approve all pending registrations
export async function PATCH() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (session.user.role === "STAFF") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        // Build where filter based on role
        const where: Record<string, unknown> = { status: "PENDING" };

        if (session.user.role === "MANAGER") {
            const manager = await prisma.employee.findUnique({ where: { userId: session.user.id } });
            if (!manager) return NextResponse.json({ error: "Manager profile not found" }, { status: 404 });
            where.departmentId = manager.departmentId;
        }

        // Get all pending registrations
        const pendingRegs = await prisma.shiftRegistration.findMany({
            where,
            include: { template: true },
        });

        if (pendingRegs.length === 0) {
            return NextResponse.json({ approved: 0, message: "No pending registrations" });
        }

        // Process each: approve + auto-create DRAFT shift
        let approvedCount = 0;

        for (const reg of pendingRegs) {
            const shiftDate = new Date(reg.date);
            const dateStr = shiftDate.toISOString().split("T")[0];
            const shiftStart = new Date(`${dateStr}T${reg.template.startTime}:00`);
            const shiftEnd = new Date(`${dateStr}T${reg.template.endTime}:00`);

            await prisma.$transaction([
                prisma.shiftRegistration.update({
                    where: { id: reg.id },
                    data: { status: "APPROVED" },
                }),
                prisma.shift.create({
                    data: {
                        employeeId: reg.employeeId,
                        departmentId: reg.departmentId,
                        date: shiftDate,
                        startTime: shiftStart,
                        endTime: shiftEnd,
                        status: "DRAFT",
                    },
                }),
            ]);
            approvedCount++;
        }

        await invalidateCache("regs:", "shifts:");
        return NextResponse.json({
            approved: approvedCount,
            message: `${approvedCount} registration${approvedCount !== 1 ? "s" : ""} approved`,
        });
    } catch (error) {
        console.error("Failed to bulk approve:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
