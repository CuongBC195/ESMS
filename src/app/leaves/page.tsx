"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
    CalendarOff,
    Plus,
    Check,
    X as XIcon,
    AlertTriangle,
    Clock,
    Trash2,
} from "lucide-react";
import { format } from "date-fns";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface LeaveRequest {
    id: string;
    startDate: string;
    endDate: string;
    reason: string | null;
    status: "PENDING" | "APPROVED" | "REJECTED";
    createdAt: string;
    employee: {
        id: string;
        fullName: string;
        userId?: string;
        department: { id: string; name: string };
    };
}

type FilterTab = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

export default function LeavesPage() {
    const { data: session } = useSession();
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [applyOpen, setApplyOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [actionError, setActionError] = useState("");
    const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);

    const canManage =
        session?.user.role === "ADMIN" || session?.user.role === "MANAGER";

    // Default tab: PENDING for managers, ALL for staff
    const [filter, setFilter] = useState<FilterTab>(
        canManage ? "PENDING" : "ALL"
    );

    const fetchLeaves = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/leaves");
            if (res.ok) setLeaves(await res.json());
        } catch (err) {
            console.error("Fetch failed:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLeaves();
    }, [fetchLeaves]);

    const handleAction = async (
        id: string,
        status: "APPROVED" | "REJECTED"
    ) => {
        const prev = [...leaves];
        setLeaves((l) => l.map((lv) => lv.id === id ? { ...lv, status } : lv));
        setActionError("");

        try {
            const res = await fetch(`/api/leaves/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });
            if (!res.ok) {
                const data = await res.json();
                setLeaves(prev);
                setActionError(data.error || "Action failed");
            }
        } catch {
            setLeaves(prev);
            setActionError("Network error");
        }
    };

    const handleCancel = async (id: string) => {
        const prev = [...leaves];
        setLeaves((l) => l.filter((lv) => lv.id !== id));
        setCancelConfirm(null);

        try {
            const res = await fetch(`/api/leaves/${id}`, { method: "DELETE" });
            if (!res.ok) {
                const data = await res.json();
                setLeaves(prev);
                setActionError(data.error || "Failed to cancel");
            }
        } catch {
            setLeaves(prev);
            setActionError("Network error");
        }
    };

    const statusBadge = (status: string) => {
        const map: Record<string, string> = {
            PENDING: "bg-amber-50 text-amber-600",
            APPROVED: "bg-green-50 text-green-600",
            REJECTED: "bg-red-50 text-red-600",
        };
        return map[status] || "bg-gray-50 text-gray-600";
    };

    const fmtDate = (iso: string) => format(new Date(iso), "MMM d, yyyy");

    const filteredLeaves =
        filter === "ALL" ? leaves : leaves.filter((l) => l.status === filter);

    const counts = {
        ALL: leaves.length,
        PENDING: leaves.filter((l) => l.status === "PENDING").length,
        APPROVED: leaves.filter((l) => l.status === "APPROVED").length,
        REJECTED: leaves.filter((l) => l.status === "REJECTED").length,
    };

    const tabs: { key: FilterTab; label: string }[] = [
        { key: "ALL", label: "All" },
        { key: "PENDING", label: "Pending" },
        { key: "APPROVED", label: "Approved" },
        { key: "REJECTED", label: "Rejected" },
    ];

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-5">
                {/* Header */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">
                            Leave Requests
                        </h1>
                        <p className="text-sm text-gray-500">
                            {counts.PENDING} pending
                            request{counts.PENDING !== 1 ? "s" : ""}
                        </p>
                    </div>
                    <button
                        onClick={() => setApplyOpen(true)}
                        className="flex items-center gap-1.5 rounded-lg bg-[#4f46e5] px-3 py-2 text-xs font-medium text-white hover:bg-[#4338ca]"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Apply for Leave
                    </button>
                </div>

                {/* Filter Tabs */}
                <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setFilter(tab.key)}
                            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filter === tab.key
                                ? "bg-[#4f46e5] text-white shadow-sm"
                                : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                                }`}
                        >
                            {tab.label}
                            <span
                                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${filter === tab.key
                                    ? "bg-white/20 text-white"
                                    : "bg-gray-100 text-gray-400"
                                    }`}
                            >
                                {counts[tab.key]}
                            </span>
                        </button>
                    ))}
                </div>

                {actionError && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                        <p className="text-sm text-red-700">{actionError}</p>
                        <button
                            onClick={() => setActionError("")}
                            className="ml-auto text-red-400 hover:text-red-600"
                        >
                            <XIcon className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}

                {/* Table */}
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    {loading ? (
                        <div className="flex h-48 items-center justify-center">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
                        </div>
                    ) : filteredLeaves.length === 0 ? (
                        <div className="flex h-48 flex-col items-center justify-center gap-1.5 text-gray-400">
                            <CalendarOff className="h-8 w-8" />
                            <p className="text-sm">
                                {filter === "ALL"
                                    ? "No leave requests"
                                    : `No ${filter.toLowerCase()} requests`}
                            </p>
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-gray-200 bg-gray-50">
                                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                        Employee
                                    </th>
                                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                        Period
                                    </th>
                                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                        Reason
                                    </th>
                                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                        Status
                                    </th>
                                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                        Submitted
                                    </th>
                                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLeaves.map((leave) => (
                                    <tr
                                        key={leave.id}
                                        className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50"
                                    >
                                        <td className="px-4 py-3">
                                            <p className="text-sm font-medium text-gray-900">
                                                {leave.employee.fullName}
                                            </p>
                                            <p className="text-[11px] text-gray-400">
                                                {leave.employee.department.name}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {fmtDate(leave.startDate)} – {fmtDate(leave.endDate)}
                                        </td>
                                        <td className="max-w-[200px] px-4 py-3 text-sm text-gray-500">
                                            <p className="truncate">{leave.reason || "—"}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusBadge(
                                                    leave.status
                                                )}`}
                                            >
                                                {leave.status === "PENDING" && (
                                                    <Clock className="h-2.5 w-2.5" />
                                                )}
                                                {leave.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-400">
                                            {fmtDate(leave.createdAt)}
                                        </td>
                                        <td className="px-4 py-3">
                                            {leave.status === "PENDING" ? (
                                                <div className="flex items-center gap-1">
                                                    {/* Manager/Admin: Approve/Reject */}
                                                    {canManage && (
                                                        <>
                                                            <button
                                                                onClick={() =>
                                                                    handleAction(leave.id, "APPROVED")
                                                                }
                                                                disabled={actionLoading === leave.id}
                                                                className="rounded-md bg-green-50 p-1.5 text-green-600 hover:bg-green-100 disabled:opacity-50"
                                                                title="Approve"
                                                            >
                                                                <Check className="h-3.5 w-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() =>
                                                                    handleAction(leave.id, "REJECTED")
                                                                }
                                                                disabled={actionLoading === leave.id}
                                                                className="rounded-md bg-red-50 p-1.5 text-red-500 hover:bg-red-100 disabled:opacity-50"
                                                                title="Reject"
                                                            >
                                                                <XIcon className="h-3.5 w-3.5" />
                                                            </button>
                                                        </>
                                                    )}
                                                    {/* Owner: Cancel own request */}
                                                    <button
                                                        onClick={() => setCancelConfirm(leave.id)}
                                                        disabled={actionLoading === leave.id}
                                                        className="rounded-md bg-gray-50 p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                                                        title="Cancel request"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-300">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Apply for Leave Modal */}
            {applyOpen && (
                <ApplyLeaveModal
                    onClose={() => setApplyOpen(false)}
                    onSuccess={fetchLeaves}
                />
            )}

            {/* Cancel Confirmation */}
            {cancelConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/20"
                        onClick={() => setCancelConfirm(null)}
                    />
                    <div className="relative w-full max-w-xs rounded-xl border border-gray-200 bg-white p-5 shadow-lg">
                        <div className="mb-3 flex items-center gap-2.5">
                            <div className="rounded-lg bg-red-50 p-2">
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-gray-900">
                                    Cancel leave request?
                                </p>
                                <p className="text-[11px] text-gray-500">
                                    This action cannot be undone
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setCancelConfirm(null)}
                                className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
                            >
                                Keep
                            </button>
                            <button
                                onClick={() => handleCancel(cancelConfirm)}
                                disabled={actionLoading === cancelConfirm}
                                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                                {actionLoading === cancelConfirm
                                    ? "Cancelling…"
                                    : "Cancel Request"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}

/* ────────────────── Apply for Leave Modal ────────────────── */

function ApplyLeaveModal({
    onClose,
    onSuccess,
}: {
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [reason, setReason] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    const today = new Date().toISOString().split("T")[0];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        if (!startDate || !endDate) {
            setError("Start and end dates are required");
            setLoading(false);
            return;
        }

        if (new Date(endDate) < new Date(startDate)) {
            setError("End date must be after start date");
            setLoading(false);
            return;
        }

        try {
            const res = await fetch("/api/leaves", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    startDate: new Date(startDate).toISOString(),
                    endDate: new Date(endDate).toISOString(),
                    reason: reason || null,
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Failed to submit leave request");
                setLoading(false);
                return;
            }

            setSuccess(true);
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 500);
        } catch {
            setError("Network error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/20" onClick={onClose} />
            <div className="relative w-full max-w-sm rounded-xl border border-gray-200 bg-white shadow-lg">
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                    <h2 className="text-sm font-semibold text-gray-900">
                        Apply for Leave
                    </h2>
                    <button
                        onClick={onClose}
                        className="rounded-md p-1 text-gray-400 hover:bg-gray-100"
                    >
                        <XIcon className="h-4 w-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5">
                    {error && (
                        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}
                    {success && (
                        <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
                            <Check className="h-3.5 w-3.5 text-green-600" />
                            <p className="text-sm text-green-700">
                                Leave request submitted
                            </p>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                    Start Date
                                </label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    min={today}
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                    required
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                    End Date
                                </label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    min={startDate || today}
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">
                                Reason{" "}
                                <span className="font-normal text-gray-400">(optional)</span>
                            </label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                rows={3}
                                placeholder="Brief reason for leave…"
                                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                            />
                        </div>
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
                            disabled={loading || success}
                            className="rounded-lg bg-[#4f46e5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338ca] disabled:opacity-50"
                        >
                            {loading
                                ? "Submitting…"
                                : success
                                    ? "Done"
                                    : "Submit Request"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
