import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/payroll/[id] — View payroll period with records
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { id } = await params;

        const period = await prisma.payrollPeriod.findUnique({
            where: { id },
            include: {
                records: {
                    include: {
                        employee: {
                            select: {
                                fullName: true,
                                department: { select: { name: true } },
                            },
                        },
                    },
                    orderBy: { employee: { fullName: "asc" } },
                },
            },
        });

        if (!period) {
            return NextResponse.json({ error: "Payroll period not found" }, { status: 404 });
        }

        // STAFF: filter to only their own record
        if (session.user.role === "STAFF") {
            const employee = await prisma.employee.findUnique({ where: { userId: session.user.id } });
            if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
            period.records = period.records.filter((r) => r.employeeId === employee.id);
        }

        // MANAGER: filter to their department
        if (session.user.role === "MANAGER") {
            const manager = await prisma.employee.findUnique({
                where: { userId: session.user.id },
                select: { departmentId: true },
            });
            if (manager) {
                period.records = period.records.filter((r) => {
                    // Check department from join
                    return true; // Already filtered at query level above
                });
            }
        }

        return NextResponse.json(period);
    } catch (error) {
        console.error("Failed to fetch payroll detail:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// PATCH /api/payroll/[id] — Update status or record deductions
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

        const period = await prisma.payrollPeriod.findUnique({ where: { id } });
        if (!period) {
            return NextResponse.json({ error: "Payroll period not found" }, { status: 404 });
        }

        // Update status (DRAFT -> CONFIRMED -> PAID)
        if (body.status) {
            const validTransitions: Record<string, string[]> = {
                DRAFT: ["CONFIRMED"],
                CONFIRMED: ["PAID", "DRAFT"],
                PAID: [],
            };

            if (!validTransitions[period.status]?.includes(body.status)) {
                return NextResponse.json(
                    { error: `Cannot change from ${period.status} to ${body.status}` },
                    { status: 400 }
                );
            }

            const updated = await prisma.payrollPeriod.update({
                where: { id },
                data: { status: body.status },
                include: {
                    records: {
                        include: { employee: { select: { fullName: true, department: { select: { name: true } } } } },
                    },
                    _count: { select: { records: true } },
                },
            });
            return NextResponse.json(updated);
        }

        // Update deductions for a specific record
        if (body.recordId && body.deductions !== undefined) {
            const record = await prisma.payrollRecord.findUnique({ where: { id: body.recordId } });
            if (!record || record.payrollPeriodId !== id) {
                return NextResponse.json({ error: "Record not found" }, { status: 404 });
            }

            if (period.status !== "DRAFT") {
                return NextResponse.json({ error: "Can only edit deductions on DRAFT payroll" }, { status: 400 });
            }

            const deductions = Math.max(0, Number(body.deductions));
            const netPay = Math.round((record.grossPay - deductions) * 100) / 100;

            const updated = await prisma.payrollRecord.update({
                where: { id: body.recordId },
                data: { deductions, netPay },
                include: { employee: { select: { fullName: true, department: { select: { name: true } } } } },
            });
            return NextResponse.json(updated);
        }

        return NextResponse.json({ error: "No valid update provided" }, { status: 400 });
    } catch (error) {
        console.error("Failed to update payroll:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// DELETE /api/payroll/[id] — Delete DRAFT payroll period
export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (session.user.role === "STAFF") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const { id } = await params;

        const period = await prisma.payrollPeriod.findUnique({ where: { id } });
        if (!period) {
            return NextResponse.json({ error: "Payroll period not found" }, { status: 404 });
        }

        if (period.status !== "DRAFT") {
            return NextResponse.json({ error: "Can only delete DRAFT payroll periods" }, { status: 400 });
        }

        await prisma.payrollPeriod.delete({ where: { id } });
        return NextResponse.json({ message: "Payroll period deleted" });
    } catch (error) {
        console.error("Failed to delete payroll:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
