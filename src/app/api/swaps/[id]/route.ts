import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/redis";

// PATCH /api/swaps/[id] — Target accepts/rejects or Manager approves/rejects
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { id } = await params;
        const body = await request.json();
        const { action } = body; // "accept" | "reject"

        if (!action || !["accept", "reject"].includes(action)) {
            return NextResponse.json({ error: "action must be 'accept' or 'reject'" }, { status: 400 });
        }

        const swap = await prisma.shiftSwapRequest.findUnique({
            where: { id },
            include: {
                requesterShift: { select: { employeeId: true, departmentId: true } },
                targetShift: { select: { employeeId: true } },
            },
        });

        if (!swap) return NextResponse.json({ error: "Swap request not found" }, { status: 404 });

        const employee = await prisma.employee.findUnique({ where: { userId: session.user.id } });
        const role = session.user.role;

        // ─── PENDING_TARGET: Target employee accepts/rejects ─────
        if (swap.status === "PENDING_TARGET") {
            if (!employee || employee.id !== swap.targetShift.employeeId) {
                return NextResponse.json({ error: "Only the target employee can respond" }, { status: 403 });
            }

            const newStatus = action === "accept" ? "PENDING_MANAGER" : "REJECTED_TARGET";
            const updated = await prisma.shiftSwapRequest.update({
                where: { id },
                data: { status: newStatus },
            });
            await invalidateCache("swaps:");
            return NextResponse.json(updated);
        }

        // ─── PENDING_MANAGER: Manager/Admin approves/rejects ─────
        if (swap.status === "PENDING_MANAGER") {
            if (role === "STAFF") {
                return NextResponse.json({ error: "Only Manager/Admin can approve swaps" }, { status: 403 });
            }

            // MANAGER scope check
            if (role === "MANAGER") {
                if (!employee || employee.departmentId !== swap.requesterShift.departmentId) {
                    return NextResponse.json({ error: "Not your department" }, { status: 403 });
                }
            }

            if (action === "reject") {
                const updated = await prisma.shiftSwapRequest.update({
                    where: { id },
                    data: { status: "REJECTED_MANAGER" },
                });
                await invalidateCache("swaps:");
                return NextResponse.json(updated);
            }

            // APPROVE: swap employeeIds on both shifts
            const reqShiftId = swap.requesterShiftId;
            const tgtShiftId = swap.targetShiftId;
            const reqEmployeeId = swap.requesterShift.employeeId;
            const tgtEmployeeId = swap.targetShift.employeeId;

            await prisma.$transaction([
                prisma.shift.update({
                    where: { id: reqShiftId },
                    data: { employeeId: tgtEmployeeId },
                }),
                prisma.shift.update({
                    where: { id: tgtShiftId },
                    data: { employeeId: reqEmployeeId },
                }),
                prisma.shiftSwapRequest.update({
                    where: { id },
                    data: { status: "APPROVED" },
                }),
            ]);

            await invalidateCache("swaps:", "shifts:");
            return NextResponse.json({ message: "Swap approved — shifts exchanged" });
        }

        return NextResponse.json(
            { error: `Cannot act on swap with status: ${swap.status}` },
            { status: 400 }
        );
    } catch (error) {
        console.error("Failed to update swap:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
