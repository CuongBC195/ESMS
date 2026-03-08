import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cached, invalidateCache } from "@/lib/redis";

// GET /api/departments — Fetch all departments (Redis cached, 120s)
export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const departments = await cached("departments:all", async () => {
            return prisma.department.findMany({
                include: {
                    _count: { select: { employees: true } },
                    shiftTemplates: { orderBy: { startTime: "asc" } },
                },
                orderBy: { name: "asc" },
            });
        }, 120);

        return NextResponse.json(departments);
    } catch (error) {
        console.error("Failed to fetch departments:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

// POST /api/departments — Create a department with shift templates (ADMIN only)
export async function POST(request: Request) {
    const session = await getServerSession(authOptions);

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
        return NextResponse.json(
            { error: "Forbidden: Only ADMIN can create departments" },
            { status: 403 }
        );
    }

    try {
        const body = await request.json();
        const { name, shiftTemplates } = body;

        if (!name || typeof name !== "string" || !name.trim()) {
            return NextResponse.json(
                { error: "Department name is required" },
                { status: 400 }
            );
        }

        // Validate templates if provided
        if (shiftTemplates && Array.isArray(shiftTemplates)) {
            for (const t of shiftTemplates) {
                if (!t.name || !t.startTime || !t.endTime) {
                    return NextResponse.json(
                        { error: "Each template requires name, startTime, and endTime" },
                        { status: 400 }
                    );
                }
            }
        }

        const department = await prisma.department.create({
            data: {
                name: name.trim(),
                ...(shiftTemplates &&
                    shiftTemplates.length > 0 && {
                    shiftTemplates: {
                        create: shiftTemplates.map(
                            (t: { name: string; startTime: string; endTime: string }) => ({
                                name: t.name.trim(),
                                startTime: t.startTime,
                                endTime: t.endTime,
                            })
                        ),
                    },
                }),
            },
            include: {
                _count: { select: { employees: true } },
                shiftTemplates: {
                    orderBy: { startTime: "asc" },
                },
            },
        });

        await invalidateCache("departments:");
        return NextResponse.json(department, { status: 201 });
    } catch (error) {
        console.error("Failed to create department:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
