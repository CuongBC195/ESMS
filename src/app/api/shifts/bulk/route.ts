import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

// PATCH /api/shifts/bulk — Publish all DRAFT shifts for a date range
export async function PATCH(request: Request) {
    const session = await getServerSession(authOptions);

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
        return NextResponse.json(
            { error: "Forbidden: Only ADMIN or MANAGER can bulk publish" },
            { status: 403 }
        );
    }

    try {
        const body = await request.json();
        const { startDate, endDate, departmentId } = body;

        if (!startDate || !endDate) {
            return NextResponse.json(
                { error: "startDate and endDate are required" },
                { status: 400 }
            );
        }

        // Build filter
        const where: Record<string, unknown> = {
            status: "DRAFT",
            date: {
                gte: new Date(startDate),
                lte: new Date(endDate),
            },
        };

        // MANAGER: scope to their department only
        if (session.user.role === "MANAGER") {
            const manager = await prisma.employee.findUnique({
                where: { userId: session.user.id },
            });
            if (!manager) {
                return NextResponse.json(
                    { error: "Manager profile not found" },
                    { status: 404 }
                );
            }
            where.departmentId = manager.departmentId;
        } else if (departmentId) {
            // ADMIN can optionally scope to a specific department
            where.departmentId = departmentId;
        }

        const result = await prisma.shift.updateMany({
            where,
            data: { status: "PUBLISHED" },
        });

        // Invalidate cache
        try {
            const keys = await redis.keys("shifts:*");
            if (keys.length > 0) await redis.del(...keys);
        } catch (cacheErr) {
            console.warn("Redis invalidation failed:", cacheErr);
        }

        return NextResponse.json({
            message: `${result.count} shift(s) published`,
            count: result.count,
        });
    } catch (error) {
        console.error("Failed to bulk publish shifts:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
