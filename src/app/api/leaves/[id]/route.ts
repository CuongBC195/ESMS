import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/redis";

// PATCH /api/leaves/[id] — Manager/Admin approves or rejects a leave request
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role === "STAFF") {
        return NextResponse.json(
            {
                error:
                    "Forbidden: Only MANAGER or ADMIN can approve/reject leaves",
            },
            { status: 403 }
        );
    }

    try {
        const { id } = await params;
        const body = await request.json();
        const { status } = body;

        if (!status || !["APPROVED", "REJECTED"].includes(status)) {
            return NextResponse.json(
                { error: "status must be 'APPROVED' or 'REJECTED'" },
                { status: 400 }
            );
        }

        const leaveRequest = await prisma.leaveRequest.findUnique({
            where: { id },
            include: {
                employee: { select: { departmentId: true } },
            },
        });

        if (!leaveRequest) {
            return NextResponse.json(
                { error: "Leave request not found" },
                { status: 404 }
            );
        }

        // Managers can only approve/reject leaves within their department
        if (session.user.role === "MANAGER") {
            const manager = await prisma.employee.findUnique({
                where: { userId: session.user.id },
            });

            if (
                !manager ||
                manager.departmentId !== leaveRequest.employee.departmentId
            ) {
                return NextResponse.json(
                    {
                        error:
                            "Forbidden: You can only manage leaves in your department",
                    },
                    { status: 403 }
                );
            }
        }

        if (leaveRequest.status !== "PENDING") {
            return NextResponse.json(
                {
                    error: `Leave request has already been ${leaveRequest.status.toLowerCase()}`,
                },
                { status: 400 }
            );
        }

        const updated = await prisma.leaveRequest.update({
            where: { id },
            data: { status },
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
        return NextResponse.json(updated);
    } catch (error) {
        console.error("Failed to update leave request:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

// DELETE /api/leaves/[id] — Staff cancels their own PENDING leave request
export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;

        const leaveRequest = await prisma.leaveRequest.findUnique({
            where: { id },
            include: {
                employee: { select: { userId: true } },
            },
        });

        if (!leaveRequest) {
            return NextResponse.json(
                { error: "Leave request not found" },
                { status: 404 }
            );
        }

        // Only the owner can cancel, or ADMIN can cancel any
        const isOwner = leaveRequest.employee.userId === session.user.id;
        const isAdmin = session.user.role === "ADMIN";

        if (!isOwner && !isAdmin) {
            return NextResponse.json(
                { error: "Forbidden: You can only cancel your own leave requests" },
                { status: 403 }
            );
        }

        if (leaveRequest.status !== "PENDING") {
            return NextResponse.json(
                {
                    error: `Cannot cancel: request has already been ${leaveRequest.status.toLowerCase()}`,
                },
                { status: 400 }
            );
        }

        await prisma.leaveRequest.delete({ where: { id } });

        return NextResponse.json({ message: "Leave request cancelled" });
    } catch (error) {
        console.error("Failed to cancel leave request:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
