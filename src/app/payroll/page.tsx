"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
    DollarSign,
    Plus,
    CheckCircle2,
    Clock,
    FileCheck,
    Trash2,
    ChevronDown,
    ChevronUp,
    AlertTriangle,
    User,
    Building2,
    RotateCw,
    Pencil,
    Loader2,
} from "lucide-react";
import { format } from "date-fns";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface PayrollRecord {
    id: string;
    employeeId: string;
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    hourlyRate: number;
    overtimeRate: number;
    grossPay: number;
    deductions: number;
    netPay: number;
    shiftsCount: number;
    employee: { fullName: string; department: { name: string } };
}

interface PayrollPeriod {
    id: string;
    startDate: string;
    endDate: string;
    status: "DRAFT" | "CONFIRMED" | "PAID" | "PROCESSING";
    createdAt: string;
    records: PayrollRecord[];
    _count?: { records: number };
}

// Staff view
interface StaffPayrollItem {
    id: string;
    startDate: string;
    endDate: string;
    status: string;
    createdAt: string;
    myRecord: {
        totalHours: number;
        regularHours: number;
        overtimeHours: number;
        grossPay: number;
        deductions: number;
        netPay: number;
        shiftsCount: number;
    };
}

export default function PayrollPage() {
    const { data: session } = useSession();
    const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
    const [staffRecords, setStaffRecords] = useState<StaffPayrollItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [generateOpen, setGenerateOpen] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [editingDed, setEditingDed] = useState<{ recordId: string; periodId: string; value: string } | null>(null);

    const isStaff = session?.user.role === "STAFF";
    const canManage = session?.user.role === "ADMIN" || session?.user.role === "MANAGER";

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    const fetchPayroll = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/payroll");
            if (res.ok) {
                const data = await res.json();
                if (isStaff) {
                    setStaffRecords(data);
                } else {
                    setPeriods(data);
                }
            }
        } catch (err) {
            console.error("Fetch payroll:", err);
        } finally {
            setLoading(false);
        }
    }, [isStaff]);

    useEffect(() => {
        fetchPayroll();
    }, [fetchPayroll]);

    // Auto-poll when there are DRAFT periods (waiting for QStash worker)
    useEffect(() => {
        const hasDraft = periods.some((p) => p.status === "DRAFT");
        if (!hasDraft || isStaff) return;
        const interval = setInterval(() => {
            fetchPayroll();
        }, 4000);
        return () => clearInterval(interval);
    }, [periods, isStaff, fetchPayroll]);

    const handleStatusChange = async (id: string, newStatus: string) => {
        const prev = [...periods];
        setPeriods((p) => p.map((pr) => pr.id === id ? { ...pr, status: newStatus as PayrollPeriod["status"] } : pr));
        showToast(`Payroll ${newStatus.toLowerCase()}`);

        try {
            const res = await fetch(`/api/payroll/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) {
                const d = await res.json();
                setPeriods(prev);
                showToast(d.error || "Failed");
            }
        } catch {
            setPeriods(prev);
            showToast("Network error");
        }
    };

    const handleDelete = async (id: string) => {
        const prev = [...periods];
        setPeriods((p) => p.filter((pr) => pr.id !== id));
        showToast("Payroll deleted");

        try {
            const res = await fetch(`/api/payroll/${id}`, { method: "DELETE" });
            if (!res.ok) {
                const d = await res.json();
                setPeriods(prev);
                showToast(d.error || "Failed");
            }
        } catch {
            setPeriods(prev);
            showToast("Network error");
        }
    };

    const handleUpdateDeductions = async () => {
        if (!editingDed) return;
        const { periodId, recordId, value } = editingDed;
        const deductions = Math.max(0, parseFloat(value) || 0);

        // Optimistic: update record in local state
        const prev = [...periods];
        setPeriods((p) => p.map((pr) => {
            if (pr.id !== periodId) return pr;
            return {
                ...pr,
                records: pr.records?.map((rec) =>
                    rec.id === recordId
                        ? { ...rec, deductions, netPay: (rec.grossPay || 0) - deductions }
                        : rec
                ),
            };
        }));
        setEditingDed(null);
        showToast("Deductions updated");

        try {
            const res = await fetch(`/api/payroll/${periodId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recordId, deductions }),
            });
            if (!res.ok) {
                const d = await res.json();
                setPeriods(prev);
                showToast(d.error || "Failed");
            }
        } catch {
            setPeriods(prev);
            showToast("Network error");
        }
    };

    const statusConfig: Record<string, { icon: typeof Clock; cls: string; label: string; animate?: boolean }> = {
        DRAFT: { icon: Loader2, cls: "bg-purple-50 text-purple-600 border-purple-200", label: "Processing…", animate: true },
        CONFIRMED: { icon: FileCheck, cls: "bg-blue-50 text-blue-600 border-blue-200", label: "Confirmed" },
        PAID: { icon: CheckCircle2, cls: "bg-green-50 text-green-600 border-green-200", label: "Paid" },
    };

    const fmtCurrency = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
    const fmtDate = (iso: string) => format(new Date(iso), "MMM d, yyyy");

    // ─── STAFF VIEW ──────────────────────────────────────────
    if (isStaff) {
        return (
            <DashboardLayout>
                <div className="flex flex-col gap-5">
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">My Payroll</h1>
                        <p className="text-sm text-gray-500">Your salary records</p>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                        {loading ? (
                            <div className="flex h-48 items-center justify-center">
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
                            </div>
                        ) : staffRecords.length === 0 ? (
                            <div className="flex h-48 flex-col items-center justify-center gap-2 text-gray-400">
                                <DollarSign className="h-10 w-10 opacity-40" />
                                <p className="text-sm font-medium">No payroll records yet</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {staffRecords.map((item) => {
                                    const st = statusConfig[item.status] || statusConfig.DRAFT;
                                    const StatusIcon = st.icon;
                                    return (
                                        <div key={item.id} className="p-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">
                                                        {fmtDate(item.startDate)} – {fmtDate(item.endDate)}
                                                    </p>
                                                    <p className="mt-0.5 text-xs text-gray-400">
                                                        {item.myRecord.shiftsCount} shifts · {item.myRecord.totalHours}h total
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-lg font-semibold text-gray-900">
                                                        {fmtCurrency(item.myRecord.netPay)}
                                                    </p>
                                                    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>
                                                        <StatusIcon className="h-2.5 w-2.5" />
                                                        {st.label}
                                                    </span>
                                                </div>
                                            </div>
                                            {item.myRecord.overtimeHours > 0 && (
                                                <p className="mt-1.5 text-[11px] text-amber-500">
                                                    Includes {item.myRecord.overtimeHours}h overtime
                                                </p>
                                            )}
                                            {item.myRecord.deductions > 0 && (
                                                <p className="text-[11px] text-red-400">
                                                    Deductions: {fmtCurrency(item.myRecord.deductions)}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    // ─── ADMIN / MANAGER VIEW ────────────────────────────────
    return (
        <DashboardLayout>
            <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">Payroll</h1>
                        <p className="text-sm text-gray-500">
                            {periods.length} payroll period{periods.length !== 1 ? "s" : ""}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setGenerateOpen(true)}
                            className="flex items-center gap-1.5 rounded-lg bg-[#4f46e5] px-3 py-2 text-xs font-medium text-white hover:bg-[#4338ca]"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Generate Payroll
                        </button>
                        <button
                            onClick={fetchPayroll}
                            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-700"
                        >
                            <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                        </button>
                    </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                    {loading ? (
                        <div className="flex h-48 items-center justify-center">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
                        </div>
                    ) : periods.length === 0 ? (
                        <div className="flex h-48 flex-col items-center justify-center gap-2 text-gray-400">
                            <DollarSign className="h-10 w-10 opacity-40" />
                            <p className="text-sm font-medium">No payroll periods</p>
                            <p className="text-xs">Click &quot;Generate Payroll&quot; to create one</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {periods.map((period) => {
                                const st = statusConfig[period.status] || statusConfig.DRAFT;
                                const StatusIcon = st.icon;
                                const isExpanded = expandedId === period.id;
                                const totalGross = period.records.reduce((s, r) => s + r.grossPay, 0);
                                const totalNet = period.records.reduce((s, r) => s + r.netPay, 0);

                                return (
                                    <div key={period.id}>
                                        {/* Period header */}
                                        <div
                                            className="flex cursor-pointer items-center gap-3 p-4 transition-colors hover:bg-gray-50/50"
                                            onClick={() => setExpandedId(isExpanded ? null : period.id)}
                                        >
                                            <div className="flex-1">
                                                <p className="text-sm font-medium text-gray-900">
                                                    {fmtDate(period.startDate)} – {fmtDate(period.endDate)}
                                                </p>
                                                <p className="mt-0.5 text-xs text-gray-400">
                                                    {period.records.length} employee{period.records.length !== 1 ? "s" : ""} · Total: {fmtCurrency(totalNet)}
                                                </p>
                                            </div>

                                            <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${st.cls}`}>
                                                <StatusIcon className={`h-3 w-3 ${st.animate ? "animate-spin" : ""}`} />
                                                {st.label}
                                            </span>

                                            {/* Actions */}
                                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                {period.status === "DRAFT" && period.records.length > 0 && (
                                                    <>
                                                        <button
                                                            onClick={() => handleStatusChange(period.id, "CONFIRMED")}
                                                            disabled={actionLoading === period.id}
                                                            className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-50"
                                                        >
                                                            Confirm
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(period.id)}
                                                            disabled={actionLoading === period.id}
                                                            className="rounded-md bg-red-50 p-1.5 text-red-400 hover:bg-red-100 disabled:opacity-50"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </>
                                                )}
                                                {period.status === "CONFIRMED" && (
                                                    <button
                                                        onClick={() => handleStatusChange(period.id, "PAID")}
                                                        disabled={actionLoading === period.id}
                                                        className="rounded-lg bg-green-50 px-2.5 py-1.5 text-[11px] font-medium text-green-600 hover:bg-green-100 disabled:opacity-50"
                                                    >
                                                        Mark as Paid
                                                    </button>
                                                )}
                                            </div>

                                            {isExpanded ? (
                                                <ChevronUp className="h-4 w-4 text-gray-400" />
                                            ) : (
                                                <ChevronDown className="h-4 w-4 text-gray-400" />
                                            )}
                                        </div>

                                        {/* Expanded records */}
                                        {isExpanded && (
                                            <div className="border-t border-gray-100 bg-gray-50/30">
                                                <table className="w-full text-left">
                                                    <thead>
                                                        <tr className="border-b border-gray-100 bg-gray-50">
                                                            <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Employee</th>
                                                            <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Shifts</th>
                                                            <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Regular</th>
                                                            <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400" title="Hours exceeding weekly max">Overtime</th>
                                                            <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Rate</th>
                                                            <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Gross</th>
                                                            <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400" title="Click to edit (Draft only)">Deductions</th>
                                                            <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Net Pay</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {period.records.map((rec) => (
                                                            <tr key={rec.id} className="border-b border-gray-50 last:border-0 hover:bg-white/50">
                                                                <td className="px-4 py-2.5">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <User className="h-3 w-3 text-gray-400" />
                                                                        <span className="text-xs font-medium text-gray-700">{rec.employee.fullName}</span>
                                                                    </div>
                                                                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-400">
                                                                        <Building2 className="h-2.5 w-2.5" />
                                                                        {rec.employee.department.name}
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-2.5 text-xs text-gray-600">{rec.shiftsCount}</td>
                                                                <td className="px-4 py-2.5 text-xs text-gray-600">{rec.regularHours}h</td>
                                                                <td className="px-4 py-2.5">
                                                                    {rec.overtimeHours > 0 ? (
                                                                        <span className="text-xs font-medium text-amber-600">{rec.overtimeHours}h</span>
                                                                    ) : (
                                                                        <span className="text-xs text-gray-300">—</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-2.5 text-xs text-gray-500">{fmtCurrency(rec.hourlyRate)}/h</td>
                                                                <td className="px-4 py-2.5 text-xs text-gray-600">{fmtCurrency(rec.grossPay)}</td>
                                                                <td className="px-4 py-2.5">
                                                                    {editingDed?.recordId === rec.id ? (
                                                                        <div className="flex items-center gap-1">
                                                                            <input
                                                                                type="number"
                                                                                step="0.01"
                                                                                min="0"
                                                                                value={editingDed.value}
                                                                                onChange={(e) => setEditingDed({ ...editingDed, value: e.target.value })}
                                                                                onKeyDown={(e) => { if (e.key === "Enter") handleUpdateDeductions(); if (e.key === "Escape") setEditingDed(null); }}
                                                                                autoFocus
                                                                                className="w-16 rounded border border-indigo-300 px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-indigo-200"
                                                                            />
                                                                            <button
                                                                                onClick={handleUpdateDeductions}
                                                                                className="rounded bg-indigo-50 p-0.5 text-indigo-600 hover:bg-indigo-100"
                                                                                title="Save"
                                                                            >
                                                                                <CheckCircle2 className="h-3 w-3" />
                                                                            </button>
                                                                        </div>
                                                                    ) : period.status === "DRAFT" ? (
                                                                        <button
                                                                            onClick={() => setEditingDed({ recordId: rec.id, periodId: period.id, value: String(rec.deductions) })}
                                                                            className="group flex items-center gap-1 text-xs text-red-400 hover:text-red-600"
                                                                            title="Click to edit deductions"
                                                                        >
                                                                            {rec.deductions > 0 ? fmtCurrency(rec.deductions) : "$0.00"}
                                                                            <Pencil className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
                                                                        </button>
                                                                    ) : (
                                                                        <span className="text-xs text-red-400">
                                                                            {rec.deductions > 0 ? fmtCurrency(rec.deductions) : "—"}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-2.5 text-xs font-semibold text-gray-900">{fmtCurrency(rec.netPay)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                    <tfoot>
                                                        <tr className="border-t border-gray-200 bg-white">
                                                            <td colSpan={5} className="px-4 py-2.5 text-[11px] font-semibold text-gray-500">TOTALS</td>
                                                            <td className="px-4 py-2.5 text-xs font-semibold text-gray-700">{fmtCurrency(totalGross)}</td>
                                                            <td className="px-4 py-2.5 text-xs font-semibold text-red-500">
                                                                {fmtCurrency(period.records.reduce((s, r) => s + r.deductions, 0))}
                                                            </td>
                                                            <td className="px-4 py-2.5 text-xs font-bold text-gray-900">{fmtCurrency(totalNet)}</td>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Generate Payroll Modal */}
            {generateOpen && (
                <GeneratePayrollModal
                    onClose={() => setGenerateOpen(false)}
                    onSuccess={() => { fetchPayroll(); setGenerateOpen(false); }}
                    showToast={showToast}
                />
            )}

            {/* Toast */}
            {toast && (
                <div className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-lg">
                    {toast}
                </div>
            )}
        </DashboardLayout>
    );
}

/* ────────────────── Generate Payroll Modal ────────────────── */

function GeneratePayrollModal({
    onClose,
    onSuccess,
    showToast,
}: {
    onClose: () => void;
    onSuccess: () => void;
    showToast: (msg: string) => void;
}) {
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // OT Rules
    const [otWeekly, setOtWeekly] = useState(true);
    const [otDaily, setOtDaily] = useState(false);
    const [otDailyThreshold, setOtDailyThreshold] = useState(8);
    const [otNight, setOtNight] = useState(false);
    const [otNightThreshold, setOtNightThreshold] = useState(22);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        if (!startDate || !endDate) {
            setError("Start and end dates are required");
            setLoading(false);
            return;
        }

        const otRules = [
            { type: "WEEKLY_HOURS", enabled: otWeekly },
            { type: "DAILY_HOURS", enabled: otDaily, threshold: otDailyThreshold },
            { type: "LATE_NIGHT", enabled: otNight, threshold: otNightThreshold },
        ];

        try {
            const res = await fetch("/api/payroll", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    startDate: new Date(startDate).toISOString(),
                    endDate: new Date(endDate).toISOString(),
                    otRules,
                }),
            });

            const data = await res.json();
            if (!res.ok && res.status !== 202) {
                setError(data.error || "Failed to generate payroll");
                setLoading(false);
                return;
            }

            if (res.status === 202) {
                showToast("Payroll queued — processing in background…");
            } else {
                showToast(`Payroll generated for ${data.records?.length || 0} employees`);
            }
            onSuccess();
        } catch {
            setError("Network error");
        } finally {
            setLoading(false);
        }
    };

    const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? "bg-[#4f46e5]" : "bg-gray-200"}`}
        >
            <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-[18px]" : "translate-x-[3px]"}`}
            />
        </button>
    );

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/20" onClick={onClose} />
            <div className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-lg">
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                    <div className="flex items-center gap-2.5">
                        <div className="rounded-lg bg-indigo-50 p-2">
                            <DollarSign className="h-4 w-4 text-[#4f46e5]" />
                        </div>
                        <h2 className="text-sm font-semibold text-gray-900">Generate Payroll</h2>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-5">
                    {error && (
                        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}

                    <p className="mb-3 text-xs text-gray-500">
                        Select a date range and overtime rules to calculate payroll from published shifts.
                    </p>

                    {/* Date range */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">Start Date</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                required
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">End Date</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                min={startDate}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                required
                            />
                        </div>
                    </div>

                    {/* OT Rules section */}
                    <div className="mt-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                            Overtime Rules
                        </p>
                        <div className="space-y-2.5 rounded-lg border border-gray-100 bg-gray-50/50 p-3">
                            {/* 1. Weekly Hours */}
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-medium text-gray-700">Weekly Hours</p>
                                    <p className="text-[10px] text-gray-400">
                                        Hours exceeding employee&apos;s Max Hours/Week
                                    </p>
                                </div>
                                <Toggle checked={otWeekly} onChange={setOtWeekly} />
                            </div>

                            <div className="border-t border-gray-100" />

                            {/* 2. Daily Hours */}
                            <div>
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-medium text-gray-700">Daily Hours</p>
                                        <p className="text-[10px] text-gray-400">
                                            Shift longer than threshold → excess is OT
                                        </p>
                                    </div>
                                    <Toggle checked={otDaily} onChange={setOtDaily} />
                                </div>
                                {otDaily && (
                                    <div className="mt-2 flex items-center gap-2">
                                        <label className="text-[10px] text-gray-500">Threshold:</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={24}
                                            value={otDailyThreshold}
                                            onChange={(e) => setOtDailyThreshold(parseInt(e.target.value) || 8)}
                                            className="w-14 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-[#4f46e5]"
                                        />
                                        <span className="text-[10px] text-gray-400">hours/shift</span>
                                    </div>
                                )}
                            </div>

                            <div className="border-t border-gray-100" />

                            {/* 3. Late Night */}
                            <div>
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-medium text-gray-700">Late Night</p>
                                        <p className="text-[10px] text-gray-400">
                                            Hours worked after a certain time → counted as OT
                                        </p>
                                    </div>
                                    <Toggle checked={otNight} onChange={setOtNight} />
                                </div>
                                {otNight && (
                                    <div className="mt-2 flex items-center gap-2">
                                        <label className="text-[10px] text-gray-500">After:</label>
                                        <select
                                            value={otNightThreshold}
                                            onChange={(e) => setOtNightThreshold(parseInt(e.target.value))}
                                            className="rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-[#4f46e5]"
                                        >
                                            {Array.from({ length: 24 }, (_, i) => (
                                                <option key={i} value={i}>
                                                    {String(i).padStart(2, "0")}:00
                                                </option>
                                            ))}
                                        </select>
                                        <span className="text-[10px] text-gray-400">onwards = OT</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <p className="mt-1.5 text-[10px] text-gray-400">
                            Multiple rules → highest OT is applied. No rules → all hours are regular.
                        </p>
                    </div>

                    <div className="mt-5 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="rounded-lg bg-[#4f46e5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338ca] disabled:opacity-50"
                        >
                            {loading ? "Generating…" : "Generate"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

