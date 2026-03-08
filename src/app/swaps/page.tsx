"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
    ArrowLeftRight,
    CheckCircle2,
    XCircle,
    Clock,
    ArrowRight,
    RotateCw,
    User,
    CalendarDays,
    Filter,
    ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface SwapShift {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    employee: {
        id: string;
        fullName: string;
        userId: string;
        department: { id: string; name: string };
    };
}

interface SwapRequest {
    id: string;
    status: string;
    createdAt: string;
    requesterShift: SwapShift;
    targetShift: SwapShift;
}

type SwapFilter = "ALL" | "PENDING" | "COMPLETED";

export default function SwapsPage() {
    const { data: session } = useSession();
    const [swaps, setSwaps] = useState<SwapRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [filter, setFilter] = useState<SwapFilter>("ALL");

    const role = session?.user.role;
    const userId = session?.user.id;

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    const fetchSwaps = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/swaps");
            if (res.ok) setSwaps(await res.json());
        } catch (err) {
            console.error("Fetch failed:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSwaps();
    }, [fetchSwaps]);

    const handleAction = async (id: string, action: "accept" | "reject") => {
        const prev = [...swaps];
        setSwaps((s) => s.filter((sw) => sw.id !== id));
        showToast(action === "accept" ? "Swap accepted" : "Swap declined");

        try {
            const res = await fetch(`/api/swaps/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            if (!res.ok) {
                const d = await res.json();
                setSwaps(prev);
                showToast(d.error || "Action failed");
            }
        } catch {
            setSwaps(prev);
            showToast("Network error");
        }
    };

    const statusConfig: Record<string, { label: string; icon: typeof Clock; cls: string }> = {
        PENDING_TARGET: { label: "Awaiting Response", icon: Clock, cls: "bg-amber-50 text-amber-600 border-amber-200" },
        PENDING_MANAGER: { label: "Awaiting Manager", icon: ShieldCheck, cls: "bg-blue-50 text-blue-600 border-blue-200" },
        APPROVED: { label: "Approved", icon: CheckCircle2, cls: "bg-green-50 text-green-600 border-green-200" },
        REJECTED_TARGET: { label: "Declined", icon: XCircle, cls: "bg-red-50 text-red-500 border-red-200" },
        REJECTED_MANAGER: { label: "Manager Rejected", icon: XCircle, cls: "bg-red-50 text-red-500 border-red-200" },
    };

    const fmtTime = (iso: string) => format(new Date(iso), "HH:mm");

    const getActions = (swap: SwapRequest) => {
        if (swap.status === "PENDING_TARGET" && swap.targetShift.employee.userId === userId)
            return "target-respond";
        if (swap.status === "PENDING_MANAGER" && (role === "ADMIN" || role === "MANAGER"))
            return "manager-respond";
        return null;
    };

    const isPending = (s: string) => s === "PENDING_TARGET" || s === "PENDING_MANAGER";

    const filtered =
        filter === "ALL"
            ? swaps
            : filter === "PENDING"
                ? swaps.filter((s) => isPending(s.status))
                : swaps.filter((s) => !isPending(s.status));

    const counts = {
        ALL: swaps.length,
        PENDING: swaps.filter((s) => isPending(s.status)).length,
        COMPLETED: swaps.filter((s) => !isPending(s.status)).length,
    };

    const filterTabs: { key: SwapFilter; label: string; icon: typeof Clock }[] = [
        { key: "ALL", label: "All", icon: Filter },
        { key: "PENDING", label: "Pending", icon: Clock },
        { key: "COMPLETED", label: "Completed", icon: CheckCircle2 },
    ];

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-5">
                {/* Header */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">
                            Shift Swap Requests
                        </h1>
                        <p className="text-sm text-gray-500">
                            {counts.PENDING} pending swap{counts.PENDING !== 1 ? "s" : ""}
                        </p>
                    </div>
                    <button
                        onClick={fetchSwaps}
                        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-700"
                    >
                        <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </button>
                </div>

                {/* Filter Tabs */}
                <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                    {filterTabs.map((tab) => {
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
                                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"
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
                            <ArrowLeftRight className="h-10 w-10 opacity-40" />
                            <p className="text-sm font-medium">No swap requests</p>
                            <p className="text-xs">
                                {filter !== "ALL"
                                    ? `No ${filter.toLowerCase()} swaps`
                                    : "Go to Schedule to request a shift swap"}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {filtered.map((swap) => {
                                const st = statusConfig[swap.status] || statusConfig.PENDING_TARGET;
                                const StatusIcon = st.icon;
                                const actions = getActions(swap);

                                return (
                                    <div
                                        key={swap.id}
                                        className="flex flex-col gap-4 p-4 transition-colors hover:bg-gray-50/50 md:flex-row md:items-center"
                                    >
                                        {/* Swap visual: requester → target */}
                                        <div className="flex flex-1 items-center gap-3">
                                            {/* Requester card */}
                                            <div className="flex-1 rounded-lg border border-gray-100 bg-gray-50/50 p-3">
                                                <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                                                    <User className="h-3.5 w-3.5 text-gray-400" />
                                                    {swap.requesterShift.employee.fullName}
                                                </div>
                                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                                                    <span className="flex items-center gap-1">
                                                        <CalendarDays className="h-3 w-3" />
                                                        {format(new Date(swap.requesterShift.date), "MMM d")}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        {fmtTime(swap.requesterShift.startTime)}–
                                                        {fmtTime(swap.requesterShift.endTime)}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Arrow */}
                                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50">
                                                <ArrowRight className="h-3.5 w-3.5 text-[#4f46e5]" />
                                            </div>

                                            {/* Target card */}
                                            <div className="flex-1 rounded-lg border border-gray-100 bg-gray-50/50 p-3">
                                                <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                                                    <User className="h-3.5 w-3.5 text-gray-400" />
                                                    {swap.targetShift.employee.fullName}
                                                </div>
                                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                                                    <span className="flex items-center gap-1">
                                                        <CalendarDays className="h-3 w-3" />
                                                        {format(new Date(swap.targetShift.date), "MMM d")}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        {fmtTime(swap.targetShift.startTime)}–
                                                        {fmtTime(swap.targetShift.endTime)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Status + Actions */}
                                        <div className="flex items-center gap-2.5 md:flex-col md:items-end">
                                            <span
                                                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${st.cls}`}
                                            >
                                                <StatusIcon className="h-3 w-3" />
                                                {st.label}
                                            </span>

                                            {actions && (
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => handleAction(swap.id, "accept")}
                                                        disabled={actionLoading === swap.id}
                                                        className="rounded-lg bg-green-50 px-2.5 py-1.5 text-[11px] font-medium text-green-600 hover:bg-green-100 disabled:opacity-50"
                                                    >
                                                        {actions === "target-respond" ? "Accept" : "Approve"}
                                                    </button>
                                                    <button
                                                        onClick={() => handleAction(swap.id, "reject")}
                                                        disabled={actionLoading === swap.id}
                                                        className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-500 hover:bg-red-100 disabled:opacity-50"
                                                    >
                                                        {actions === "target-respond" ? "Decline" : "Reject"}
                                                    </button>
                                                </div>
                                            )}

                                            <p className="text-[10px] text-gray-300">
                                                {format(new Date(swap.createdAt), "MMM d, HH:mm")}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <div className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-lg">
                    {toast}
                </div>
            )}
        </DashboardLayout>
    );
}
