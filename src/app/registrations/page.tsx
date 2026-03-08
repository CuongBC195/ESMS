"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
    ClipboardList,
    CheckCircle2,
    XCircle,
    Clock,
    CalendarDays,
    RotateCw,
    User,
    Building2,
    Filter,
    CheckCheck,
} from "lucide-react";
import { format } from "date-fns";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface Registration {
    id: string;
    date: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    createdAt: string;
    employee: { fullName: string; department: { name: string } };
    template: { name: string; startTime: string; endTime: string };
}

type FilterTab = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

export default function RegistrationsPage() {
    const { data: session } = useSession();
    const [regs, setRegs] = useState<Registration[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [confirmBulk, setConfirmBulk] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const canManage =
        session?.user.role === "ADMIN" || session?.user.role === "MANAGER";
    const [filter, setFilter] = useState<FilterTab>(canManage ? "PENDING" : "ALL");

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    const fetchRegs = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/registrations");
            if (res.ok) setRegs(await res.json());
        } catch (err) {
            console.error("Fetch failed:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRegs();
    }, [fetchRegs]);

    const handleAction = async (id: string, status: "APPROVED" | "REJECTED") => {
        // Optimistic: update local state immediately
        const prev = [...regs];
        setRegs((r) => r.map((reg) => reg.id === id ? { ...reg, status } : reg));
        showToast(status === "APPROVED" ? "Registration approved — draft shift created" : "Registration rejected");

        try {
            const res = await fetch(`/api/registrations/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });
            if (!res.ok) {
                const data = await res.json();
                setRegs(prev); // revert
                showToast(data.error || "Action failed");
            }
        } catch {
            setRegs(prev);
            showToast("Network error");
        }
    };

    const handleCancel = async (id: string) => {
        const prev = [...regs];
        setRegs((r) => r.filter((reg) => reg.id !== id));
        showToast("Registration cancelled");

        try {
            const res = await fetch(`/api/registrations/${id}`, { method: "DELETE" });
            if (!res.ok) {
                setRegs(prev);
                showToast("Failed to cancel");
            }
        } catch {
            setRegs(prev);
            showToast("Network error");
        }
    };

    const handleBulkApprove = async () => {
        const prev = [...regs];
        const pendingCount = regs.filter((r) => r.status === "PENDING").length;
        setRegs((r) => r.map((reg) => reg.status === "PENDING" ? { ...reg, status: "APPROVED" } : reg));
        setConfirmBulk(false);
        showToast(`${pendingCount} registration${pendingCount !== 1 ? "s" : ""} approved`);

        try {
            const res = await fetch("/api/registrations/bulk", { method: "PATCH" });
            if (!res.ok) {
                const data = await res.json();
                setRegs(prev);
                showToast(data.error || "Bulk approve failed");
            }
        } catch {
            setRegs(prev);
            showToast("Network error");
        }
    };

    const filtered = filter === "ALL" ? regs : regs.filter((r) => r.status === filter);

    const counts = {
        ALL: regs.length,
        PENDING: regs.filter((r) => r.status === "PENDING").length,
        APPROVED: regs.filter((r) => r.status === "APPROVED").length,
        REJECTED: regs.filter((r) => r.status === "REJECTED").length,
    };

    const tabs: { key: FilterTab; label: string; icon: typeof Clock }[] = [
        { key: "ALL", label: "All", icon: Filter },
        { key: "PENDING", label: "Pending", icon: Clock },
        { key: "APPROVED", label: "Approved", icon: CheckCircle2 },
        { key: "REJECTED", label: "Rejected", icon: XCircle },
    ];

    const statusConfig: Record<string, { icon: typeof Clock; cls: string; label: string }> = {
        PENDING: { icon: Clock, cls: "bg-amber-50 text-amber-600 border-amber-200", label: "Pending" },
        APPROVED: { icon: CheckCircle2, cls: "bg-green-50 text-green-600 border-green-200", label: "Approved" },
        REJECTED: { icon: XCircle, cls: "bg-red-50 text-red-500 border-red-200", label: "Rejected" },
    };

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-5">
                {/* Header */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">
                            Shift Registrations
                        </h1>
                        <p className="text-sm text-gray-500">
                            {canManage
                                ? `${counts.PENDING} pending review`
                                : "Your shift registration requests"}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {canManage && counts.PENDING > 0 && (
                            <button
                                onClick={() => setConfirmBulk(true)}
                                disabled={bulkLoading}
                                className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                            >
                                <CheckCheck className={`h-3.5 w-3.5 ${bulkLoading ? "animate-spin" : ""}`} />
                                Approve All ({counts.PENDING})
                            </button>
                        )}
                        <button
                            onClick={fetchRegs}
                            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-700"
                        >
                            <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const active = filter === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setFilter(tab.key)}
                                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${active
                                    ? "bg-[#4f46e5] text-white shadow-sm"
                                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                                    }`}
                            >
                                <Icon className="h-3 w-3" />
                                {tab.label}
                                <span
                                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active
                                        ? "bg-white/20 text-white"
                                        : "bg-gray-100 text-gray-400"
                                        }`}
                                >
                                    {counts[tab.key]}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                    {loading ? (
                        <div className="flex h-48 items-center justify-center">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex h-48 flex-col items-center justify-center gap-2 text-gray-400">
                            <ClipboardList className="h-10 w-10 opacity-40" />
                            <p className="text-sm font-medium">No registrations found</p>
                            <p className="text-xs">
                                {filter !== "ALL"
                                    ? `No ${filter.toLowerCase()} registrations`
                                    : canManage
                                        ? "Staff haven't submitted any shift preferences yet"
                                        : "Go to Schedule to register for shifts"}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {filtered.map((reg) => {
                                const st = statusConfig[reg.status] || statusConfig.PENDING;
                                const StatusIcon = st.icon;

                                return (
                                    <div
                                        key={reg.id}
                                        className="flex flex-col gap-3 p-4 transition-colors hover:bg-gray-50/50 sm:flex-row sm:items-center"
                                    >
                                        {/* Info section */}
                                        <div className="flex-1 space-y-1.5">
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                                                    <User className="h-3.5 w-3.5 text-gray-400" />
                                                    {reg.employee.fullName}
                                                </div>
                                                <span className="text-[10px] text-gray-300">•</span>
                                                <div className="flex items-center gap-1 text-[11px] text-gray-400">
                                                    <Building2 className="h-3 w-3" />
                                                    {reg.employee.department.name}
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-3">
                                                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                                    <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
                                                    {format(new Date(reg.date), "EEE, MMM d, yyyy")}
                                                </div>
                                                <div className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600">
                                                    {reg.template.name}
                                                    <span className="ml-1 text-indigo-400">
                                                        {reg.template.startTime}–{reg.template.endTime}
                                                    </span>
                                                </div>
                                            </div>

                                            <p className="text-[10px] text-gray-300">
                                                Submitted {format(new Date(reg.createdAt), "MMM d, HH:mm")}
                                            </p>
                                        </div>

                                        {/* Status + Actions */}
                                        <div className="flex items-center gap-2.5">
                                            <span
                                                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${st.cls}`}
                                            >
                                                <StatusIcon className="h-3 w-3" />
                                                {st.label}
                                            </span>

                                            {reg.status === "PENDING" && (
                                                <div className="flex items-center gap-1">
                                                    {canManage && (
                                                        <>
                                                            <button
                                                                onClick={() => handleAction(reg.id, "APPROVED")}
                                                                disabled={actionLoading === reg.id}
                                                                className="rounded-lg bg-green-50 px-2.5 py-1.5 text-[11px] font-medium text-green-600 hover:bg-green-100 disabled:opacity-50"
                                                                title="Approve — creates a draft shift"
                                                            >
                                                                Approve
                                                            </button>
                                                            <button
                                                                onClick={() => handleAction(reg.id, "REJECTED")}
                                                                disabled={actionLoading === reg.id}
                                                                className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-500 hover:bg-red-100 disabled:opacity-50"
                                                            >
                                                                Reject
                                                            </button>
                                                        </>
                                                    )}
                                                    {!canManage && (
                                                        <button
                                                            onClick={() => handleCancel(reg.id)}
                                                            disabled={actionLoading === reg.id}
                                                            className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-[11px] font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                                                        >
                                                            Cancel
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Approve All Confirmation */}
            {confirmBulk && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/20" onClick={() => setConfirmBulk(false)} />
                    <div className="relative w-full max-w-xs rounded-xl border border-gray-200 bg-white p-5 shadow-lg">
                        <div className="mb-3 flex items-center gap-2.5">
                            <div className="rounded-lg bg-green-50 p-2">
                                <CheckCheck className="h-4 w-4 text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-gray-900">
                                    Approve all pending?
                                </p>
                                <p className="text-[11px] text-gray-500">
                                    {counts.PENDING} registration{counts.PENDING !== 1 ? "s" : ""} will be approved and draft shifts created
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setConfirmBulk(false)}
                                className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleBulkApprove}
                                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                            >
                                Approve All
                            </button>
                        </div>
                    </div>
                </div>
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
