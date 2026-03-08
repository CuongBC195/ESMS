import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

// Helper: get MANAGER's department ID
async function getManagerDeptId(
    userId: string
): Promise<string | null> {
    const manager = await prisma.employee.findUnique({
        where: { userId },
    });
    return manager?.departmentId || null;
}

// Invalidate shift cache
async function invalidateShiftCache(departmentId: string) {
    try {
        const deptPattern = `shifts:dept:${departmentId}:*`;
        const allPattern = `shifts:dept:all:*`;
        const keys = [
            ...(await redis.keys(deptPattern)),
            ...(await redis.keys(allPattern)),
        ];
        if (keys.length > 0) await redis.del(...keys);
    } catch (cacheErr) {
        console.warn("Redis invalidation failed:", cacheErr);
    }
}

// PATCH /api/shifts/[id] — Update shift status (ADMIN/MANAGER own dept only)
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
            { error: "Forbidden: Only ADMIN or MANAGER can update shifts" },
            { status: 403 }
        );
    }

    try {
        const { id } = await params;
        const body = await request.json();
        const { status } = body;

        const validStatuses = ["DRAFT", "PUBLISHED"];
        if (!status || !validStatuses.includes(status)) {
            return NextResponse.json(
                { error: "status must be 'DRAFT' or 'PUBLISHED'" },
                { status: 400 }
            );
        }

        const shift = await prisma.shift.findUnique({ where: { id } });

        if (!shift) {
            return NextResponse.json(
                { error: "Shift not found" },
                { status: 404 }
            );
        }

        // MANAGER: can only update shifts in their own department
        if (session.user.role === "MANAGER") {
            const managerDeptId = await getManagerDeptId(session.user.id);
            if (managerDeptId !== shift.departmentId) {
                return NextResponse.json(
                    { error: "Forbidden: You can only manage shifts in your department" },
                    { status: 403 }
                );
            }
        }

        const updated = await prisma.shift.update({
            where: { id },
            data: { status },
            include: {
                employee: {
                    select: {
                        id: true,
                        fullName: true,
                        user: { select: { email: true } },
                    },
                },
                department: { select: { id: true, name: true } },
            },
        });

        await invalidateShiftCache(updated.departmentId);

        return NextResponse.json(updated);
    } catch (error) {
        console.error("Failed to update shift:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

// DELETE /api/shifts/[id] — Delete a shift (ADMIN/MANAGER own dept only)
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
            { error: "Forbidden: Only ADMIN or MANAGER can delete shifts" },
            { status: 403 }
        );
    }

    try {
        const { id } = await params;

        const shift = await prisma.shift.findUnique({ where: { id } });

        if (!shift) {
            return NextResponse.json(
                { error: "Shift not found" },
                { status: 404 }
            );
        }

        // MANAGER: can only delete shifts in their own department
        if (session.user.role === "MANAGER") {
            const managerDeptId = await getManagerDeptId(session.user.id);
            if (managerDeptId !== shift.departmentId) {
                return NextResponse.json(
                    { error: "Forbidden: You can only manage shifts in your department" },
                    { status: 403 }
                );
            }
        }

        await prisma.shift.delete({ where: { id } });
        await invalidateShiftCache(shift.departmentId);

        return NextResponse.json({ message: "Shift deleted" });
    } catch (error) {
        console.error("Failed to delete shift:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
