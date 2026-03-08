"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
    startOfWeek,
    endOfWeek,
    addWeeks,
    subWeeks,
    format,
    eachDayOfInterval,
    isSameDay,
    isToday,
    differenceInMinutes,
} from "date-fns";
import {
    ChevronLeft,
    ChevronRight,
    Plus,
    Clock,
    RotateCw,
    CheckCircle2,
    XCircle,
    Trash2,
    AlertTriangle,
    Upload,
    Building2,
    Mail,
    ArrowLeftRight,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AddShiftModal from "@/components/schedule/AddShiftModal";

interface ShiftData {
    id: string;
    employeeId: string;
    departmentId: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    employee: {
        id: string;
        fullName: string;
        user: { email: string };
    };
    department: { id: string; name: string };
}

interface EmployeeData {
    id: string;
    fullName: string;
    maxHoursPerWeek: number;
    user: { email: string; role: string };
    department: { id: string; name: string };
}

interface DepartmentData {
    id: string;
    name: string;
}

interface RegData {
    id: string;
    date: string;
    templateId: string;
    status: string;
    template: { name: string; startTime: string; endTime: string };
}

export default function SchedulePage() {
    const { data: session } = useSession();
    const [currentWeek, setCurrentWeek] = useState(new Date());
    const [shifts, setShifts] = useState<ShiftData[]>([]);
    const [allEmployees, setAllEmployees] = useState<EmployeeData[]>([]);
    const [departments, setDepartments] = useState<DepartmentData[]>([]);
    const [selectedDeptId, setSelectedDeptId] = useState<string>("all");
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string | undefined>();
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>();
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<ShiftData | null>(null);
    const [publishingAll, setPublishingAll] = useState(false);

    // Staff-specific state
    const [templates, setTemplates] = useState<{ id: string; name: string; startTime: string; endTime: string }[]>([]);
    const [myRegistrations, setMyRegistrations] = useState<RegData[]>([]);
    const [registerDay, setRegisterDay] = useState<Date | null>(null);
    const [registerLoading, setRegisterLoading] = useState(false);
    const [swapShift, setSwapShift] = useState<ShiftData | null>(null);
    const [swapEmail, setSwapEmail] = useState("");
    const [swapLoading, setSwapLoading] = useState(false);
    const [swapError, setSwapError] = useState("");
    const [toast, setToast] = useState<string | null>(null);

    const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

    const role = session?.user.role;
    const isStaff = role === "STAFF";
    const isAdmin = role === "ADMIN";
    const canManage = role === "ADMIN" || role === "MANAGER";

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const startStr = format(weekStart, "yyyy-MM-dd");
            const endStr = format(weekEnd, "yyyy-MM-dd");

            const shiftsPromise = fetch(
                `/api/shifts?startDate=${startStr}&endDate=${endStr}`
            );

            if (isStaff) {
                const shiftsRes = await shiftsPromise;
                if (shiftsRes.ok) setShifts(await shiftsRes.json());
            } else {
                const fetches: Promise<Response>[] = [
                    shiftsPromise,
                    fetch("/api/employees"),
                ];
                if (isAdmin) {
                    fetches.push(fetch("/api/departments"));
                }
                const results = await Promise.all(fetches);

                if (results[0].ok) setShifts(await results[0].json());
                if (results[1].ok) setAllEmployees(await results[1].json());
                if (isAdmin && results[2]?.ok) {
                    setDepartments(await results[2].json());
                }
            }
        } catch (err) {
            console.error("Failed to fetch:", err);
        } finally {
            setLoading(false);
        }
    }, [weekStart.toISOString(), weekEnd.toISOString(), isStaff, isAdmin]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // ─── Staff: fetch templates + registrations ──────────────────
    const fetchStaffData = useCallback(async () => {
        if (!isStaff) return;
        try {
            const [deptRes, profileRes, regRes] = await Promise.all([
                fetch("/api/departments"),
                fetch("/api/profile"),
                fetch("/api/registrations"),
            ]);
            if (deptRes.ok && profileRes.ok) {
                const depts = await deptRes.json();
                const profile = await profileRes.json();
                const myDeptName = profile.employee?.department?.name;
                const myDept = depts.find(
                    (d: { name: string; shiftTemplates?: { id: string; name: string; startTime: string; endTime: string }[] }) =>
                        d.name === myDeptName
                );
                if (myDept?.shiftTemplates) setTemplates(myDept.shiftTemplates);
            }
            if (regRes.ok) setMyRegistrations(await regRes.json());
        } catch (err) {
            console.error("Fetch staff data:", err);
        }
    }, [isStaff]);

    useEffect(() => {
        fetchStaffData();
    }, [fetchStaffData]);

    // ─── Filter employees by department (ADMIN only) ──────────
    const employees = useMemo(() => {
        if (!isAdmin || selectedDeptId === "all") return allEmployees;
        return allEmployees.filter((e) => e.department.id === selectedDeptId);
    }, [allEmployees, selectedDeptId, isAdmin]);

    const visibleShifts = useMemo(() => {
        if (!isAdmin || selectedDeptId === "all") return shifts;
        return shifts.filter((s) => s.departmentId === selectedDeptId);
    }, [shifts, selectedDeptId, isAdmin]);

    const weeklyHours = useMemo(() => {
        const map: Record<string, number> = {};
        visibleShifts.forEach((s) => {
            const mins = differenceInMinutes(new Date(s.endTime), new Date(s.startTime));
            map[s.employeeId] = (map[s.employeeId] || 0) + mins;
        });
        Object.keys(map).forEach((k) => {
            map[k] = Math.round((map[k] / 60) * 10) / 10;
        });
        return map;
    }, [visibleShifts]);

    const draftCount = visibleShifts.filter((s) => s.status === "DRAFT").length;

    const getShiftsForDay = (day: Date): ShiftData[] =>
        visibleShifts.filter((s) => isSameDay(new Date(s.date), day));

    const getShiftsForCell = (employeeId: string, day: Date): ShiftData[] =>
        visibleShifts.filter(
            (s) => s.employeeId === employeeId && isSameDay(new Date(s.date), day)
        );

    const getRegsForDay = (day: Date) =>
        myRegistrations.filter((r) => isSameDay(new Date(r.date), day));

    const isTemplateRegistered = (day: Date, templateId: string) =>
        myRegistrations.some(
            (r) => isSameDay(new Date(r.date), day) && r.templateId === templateId && r.status !== "REJECTED"
        );

    // ─── Manager/Admin actions ──────────────────────────────────
    const handleCellClick = (employeeId: string, day: Date) => {
        if (!canManage) return;
        setSelectedEmployeeId(employeeId);
        setSelectedDate(format(day, "yyyy-MM-dd"));
        setModalOpen(true);
    };

    const handleAddShift = () => {
        setSelectedEmployeeId(undefined);
        setSelectedDate(undefined);
        setModalOpen(true);
    };

    const handleToggleStatus = async (shift: ShiftData) => {
        setActionLoading(shift.id);
        const newStatus = shift.status === "DRAFT" ? "PUBLISHED" : "DRAFT";
        try {
            const res = await fetch(`/api/shifts/${shift.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) {
                setShifts((prev) =>
                    prev.map((s) => (s.id === shift.id ? { ...s, status: newStatus } : s))
                );
            }
        } catch (err) {
            console.error("Failed to update shift:", err);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDeleteShift = async (shiftId: string) => {
        setActionLoading(shiftId);
        try {
            const res = await fetch(`/api/shifts/${shiftId}`, { method: "DELETE" });
            if (res.ok) {
                setShifts((prev) => prev.filter((s) => s.id !== shiftId));
            }
        } catch (err) {
            console.error("Failed to delete shift:", err);
        } finally {
            setActionLoading(null);
            setDeleteConfirm(null);
        }
    };

    const handlePublishAll = async () => {
        setPublishingAll(true);
        try {
            const res = await fetch("/api/shifts/bulk", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    startDate: format(weekStart, "yyyy-MM-dd"),
                    endDate: format(weekEnd, "yyyy-MM-dd"),
                    ...(selectedDeptId !== "all" && { departmentId: selectedDeptId }),
                }),
            });
            if (res.ok) await fetchData();
        } catch (err) {
            console.error("Failed to bulk publish:", err);
        } finally {
            setPublishingAll(false);
        }
    };

    // ─── Staff registration + swap ──────────────────────────────
    const handleRegister = async (day: Date, templateId: string) => {
        setRegisterLoading(true);
        try {
            const res = await fetch("/api/registrations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date: format(day, "yyyy-MM-dd"), templateId }),
            });
            if (res.ok) {
                showToast("✓ Registration submitted!");
                await fetchStaffData();
            } else {
                const d = await res.json();
                showToast("✗ " + (d.error || "Registration failed"));
            }
        } catch {
            showToast("✗ Network error");
        } finally {
            setRegisterLoading(false);
        }
    };

    const handleRegisterAll = async (day: Date) => {
        setRegisterLoading(true);
        let count = 0;
        for (const t of templates) {
            if (isTemplateRegistered(day, t.id)) continue;
            try {
                const res = await fetch("/api/registrations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ date: format(day, "yyyy-MM-dd"), templateId: t.id }),
                });
                if (res.ok) count++;
            } catch {
                /* skip */
            }
        }
        showToast(count > 0 ? `✓ Registered for ${count} slot${count > 1 ? "s" : ""}!` : "All slots already registered");
        await fetchStaffData();
        setRegisterLoading(false);
        setRegisterDay(null);
    };

    const handleOpenSwap = (shift: ShiftData) => {
        setSwapShift(shift);
        setSwapEmail("");
        setSwapError("");
    };

    const handleRequestSwap = async () => {
        if (!swapShift || !swapEmail.trim()) return;
        setSwapLoading(true);
        setSwapError("");
        try {
            const res = await fetch("/api/swaps", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    requesterShiftId: swapShift.id,
                    targetEmail: swapEmail.trim(),
                }),
            });
            if (res.ok) {
                setSwapShift(null);
                showToast("Swap request sent! Waiting for colleague to accept.");
            } else {
                const d = await res.json();
                setSwapError(d.error || "Swap failed");
            }
        } catch {
            setSwapError("Network error");
        } finally {
            setSwapLoading(false);
        }
    };

    const fmtTime = (iso: string) => format(new Date(iso), "HH:mm");

    // ─── RENDER: STAFF personal calendar ─────────────────────────
    if (isStaff) {
        return (
            <DashboardLayout>
                <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h1 className="text-lg font-semibold text-gray-900">My Schedule</h1>
                            <p className="text-sm text-gray-500">
                                {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center rounded-lg border border-gray-200 bg-white">
                                <button
                                    onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
                                    className="p-2 text-gray-400 hover:text-gray-600"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => setCurrentWeek(new Date())}
                                    className="border-x border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                                >
                                    Today
                                </button>
                                <button
                                    onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
                                    className="p-2 text-gray-400 hover:text-gray-600"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                            <button
                                onClick={() => {
                                    fetchData();
                                    fetchStaffData();
                                }}
                                className="rounded-lg border border-gray-200 bg-white p-2 text-gray-400 hover:text-gray-600"
                            >
                                <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                            </button>
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                        {loading ? (
                            <div className="flex h-40 items-center justify-center">
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-7 divide-x divide-gray-100">
                                {weekDays.map((day) => {
                                    const today = isToday(day);
                                    const dayShifts = getShiftsForDay(day);
                                    const dayRegs = getRegsForDay(day);
                                    return (
                                        <div
                                            key={day.toISOString()}
                                            className={`min-h-[180px] p-2 ${today ? "bg-indigo-50/30" : ""}`}
                                        >
                                            <div className="mb-2 text-center">
                                                <p
                                                    className={`text-[11px] font-medium uppercase tracking-wider ${today ? "text-[#4f46e5]" : "text-gray-400"}`}
                                                >
                                                    {format(day, "EEE")}
                                                </p>
                                                <p
                                                    className={`text-lg font-semibold ${today ? "text-[#4f46e5]" : "text-gray-700"}`}
                                                >
                                                    {format(day, "d")}
                                                </p>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                {/* Published shifts */}
                                                {dayShifts.map((shift) => (
                                                    <div
                                                        key={shift.id}
                                                        className="rounded-md bg-emerald-50 px-1.5 py-1 text-emerald-700"
                                                    >
                                                        <div className="flex items-center gap-1 text-[10px] font-semibold">
                                                            <Clock className="h-2.5 w-2.5" />
                                                            {fmtTime(shift.startTime)}–{fmtTime(shift.endTime)}
                                                        </div>
                                                        <button
                                                            onClick={() => handleOpenSwap(shift)}
                                                            className="text-[9px] font-medium text-emerald-500 underline decoration-dotted hover:text-emerald-700"
                                                        >
                                                            Swap
                                                        </button>
                                                    </div>
                                                ))}

                                                {/* Registered slots */}
                                                {dayRegs.map((reg) => {
                                                    const c =
                                                        reg.status === "APPROVED"
                                                            ? "bg-green-50 text-green-600 border-green-200"
                                                            : reg.status === "REJECTED"
                                                                ? "bg-red-50 text-red-400 border-red-200"
                                                                : "bg-amber-50 text-amber-600 border-amber-200";
                                                    return (
                                                        <div key={reg.id} className={`rounded-md border px-1.5 py-1 ${c}`}>
                                                            <p className="text-[10px] font-semibold">{reg.template.name}</p>
                                                            <p className="flex items-center gap-0.5 text-[9px] font-medium uppercase opacity-70">
                                                                {reg.status === "PENDING" && <><Clock className="h-2.5 w-2.5" /> pending</>}
                                                                {reg.status === "APPROVED" && <><CheckCircle2 className="h-2.5 w-2.5" /> approved</>}
                                                                {reg.status === "REJECTED" && <><XCircle className="h-2.5 w-2.5" /> rejected</>}
                                                            </p>
                                                        </div>
                                                    );
                                                })}

                                                {dayShifts.length === 0 && dayRegs.length === 0 && (
                                                    <p className="py-1 text-center text-[10px] text-gray-300">No shift</p>
                                                )}

                                                {/* Register button */}
                                                {templates.length > 0 && (
                                                    <button
                                                        onClick={() => setRegisterDay(day)}
                                                        className="mt-1 rounded-md border border-dashed border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-400 hover:border-[#4f46e5] hover:text-[#4f46e5]"
                                                    >
                                                        + Register
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-400">
                        <div className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-100" /> Confirmed shift
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-sm bg-amber-100" /> Pending registration
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-sm bg-green-100" /> Approved
                        </div>
                    </div>
                </div>

                {/* Toast */}
                {toast && (
                    <div className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-lg">
                        {toast}
                    </div>
                )}

                {/* Register Modal */}
                {registerDay && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/20" onClick={() => setRegisterDay(null)} />
                        <div className="relative w-full max-w-xs rounded-xl border border-gray-200 bg-white p-5 shadow-lg">
                            <h3 className="text-sm font-semibold text-gray-900">
                                Register for {format(registerDay, "MMM d, yyyy")}
                            </h3>
                            <p className="mb-3 text-xs text-gray-500">Pick a shift slot</p>
                            <div className="flex flex-col gap-2">
                                {templates.map((t) => {
                                    const done = isTemplateRegistered(registerDay, t.id);
                                    return (
                                        <button
                                            key={t.id}
                                            onClick={() => handleRegister(registerDay, t.id)}
                                            disabled={registerLoading || done}
                                            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${done
                                                ? "border-green-200 bg-green-50 text-green-500 cursor-not-allowed"
                                                : "border-gray-200 hover:border-[#4f46e5] hover:bg-indigo-50"
                                                } disabled:opacity-60`}
                                        >
                                            <span className="font-medium">
                                                {done ? "✓ " : ""}
                                                {t.name}
                                            </span>
                                            <span className="text-xs text-gray-400">
                                                {t.startTime}–{t.endTime}
                                            </span>
                                        </button>
                                    );
                                })}

                                {/* All Day option */}
                                {templates.length > 1 && (
                                    <button
                                        onClick={() => handleRegisterAll(registerDay)}
                                        disabled={registerLoading}
                                        className="flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-indigo-200 bg-indigo-50/50 px-3 py-2 text-sm font-semibold text-[#4f46e5] hover:border-[#4f46e5] hover:bg-indigo-50 disabled:opacity-50"
                                    >
                                        All Day (all {templates.length} slots)
                                    </button>
                                )}
                            </div>
                            <button
                                onClick={() => setRegisterDay(null)}
                                className="mt-3 w-full rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Swap Modal */}
                {/* Swap Modal — email input */}
                {swapShift && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/20" onClick={() => setSwapShift(null)} />
                        <div className="relative w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-lg">
                            <div className="mb-3 flex items-center gap-2.5">
                                <div className="rounded-lg bg-indigo-50 p-2">
                                    <ArrowLeftRight className="h-4 w-4 text-[#4f46e5]" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-900">Request Shift Swap</h3>
                                    <p className="text-[11px] text-gray-400">
                                        {format(new Date(swapShift.date), "EEE, MMM d")} · {fmtTime(swapShift.startTime)}–{fmtTime(swapShift.endTime)}
                                    </p>
                                </div>
                            </div>

                            <p className="mb-2 text-xs text-gray-500">
                                Enter your colleague&apos;s email to swap shifts. They must have a published shift on the same day.
                            </p>

                            <div className="relative mb-3">
                                <Mail className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="email"
                                    value={swapEmail}
                                    onChange={(e) => { setSwapEmail(e.target.value); setSwapError(""); }}
                                    placeholder="colleague@email.com"
                                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-[#4f46e5] focus:bg-white focus:ring-1 focus:ring-[#4f46e5]"
                                    onKeyDown={(e) => e.key === "Enter" && handleRequestSwap()}
                                    autoFocus
                                />
                            </div>

                            {swapError && (
                                <div className="mb-3 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2">
                                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                                    <p className="text-xs text-red-600">{swapError}</p>
                                </div>
                            )}

                            <div className="flex gap-2">
                                <button
                                    onClick={() => setSwapShift(null)}
                                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleRequestSwap}
                                    disabled={swapLoading || !swapEmail.trim()}
                                    className="flex-1 rounded-lg bg-[#4f46e5] px-3 py-2 text-xs font-medium text-white hover:bg-[#4338ca] disabled:opacity-50"
                                >
                                    {swapLoading ? "Sending..." : "Send Request"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </DashboardLayout>
        );
    }

    // ─── RENDER: MANAGER/ADMIN full matrix ───────────────────────
    return (
        <DashboardLayout>
            <div className="flex flex-col gap-5">
                {/* Header */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">Schedule</h1>
                        <p className="text-sm text-gray-500">
                            {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Department Filter — ADMIN only */}
                        {isAdmin && departments.length > 0 && (
                            <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5">
                                <Building2 className="h-3.5 w-3.5 text-gray-400" />
                                <select
                                    value={selectedDeptId}
                                    onChange={(e) => setSelectedDeptId(e.target.value)}
                                    className="appearance-none border-0 bg-transparent pr-4 text-xs font-medium text-gray-700 outline-none"
                                >
                                    <option value="all">All Departments</option>
                                    {departments.map((d) => (
                                        <option key={d.id} value={d.id}>
                                            {d.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="flex items-center rounded-lg border border-gray-200 bg-white">
                            <button
                                onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
                                className="p-2 text-gray-400 hover:text-gray-600"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => setCurrentWeek(new Date())}
                                className="border-x border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                            >
                                Today
                            </button>
                            <button
                                onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
                                className="p-2 text-gray-400 hover:text-gray-600"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>

                        <button
                            onClick={fetchData}
                            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-400 hover:text-gray-600"
                        >
                            <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                        </button>

                        {/* Publish All Drafts */}
                        {draftCount > 0 && (
                            <button
                                onClick={handlePublishAll}
                                disabled={publishingAll}
                                className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                            >
                                <Upload className="h-3.5 w-3.5" />
                                Publish All
                                <span className="rounded-full bg-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                                    {draftCount}
                                </span>
                            </button>
                        )}

                        <button
                            onClick={handleAddShift}
                            className="flex items-center gap-1.5 rounded-lg bg-[#4f46e5] px-3 py-2 text-xs font-medium text-white hover:bg-[#4338ca]"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Add Shift
                        </button>
                    </div>
                </div>

                {/* Grid */}
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                    {loading ? (
                        <div className="flex h-60 items-center justify-center">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
                        </div>
                    ) : employees.length === 0 ? (
                        <div className="flex h-60 flex-col items-center justify-center gap-1.5 text-gray-400">
                            <p className="text-sm">
                                {selectedDeptId !== "all"
                                    ? "No employees in this department"
                                    : "No employees found"}
                            </p>
                            <p className="text-xs">
                                {selectedDeptId !== "all"
                                    ? "Select another department or add employees"
                                    : "Add employees to start scheduling"}
                            </p>
                        </div>
                    ) : (
                        <table className="w-full min-w-[860px] table-fixed border-collapse">
                            <thead>
                                <tr>
                                    <th className="sticky left-0 z-10 w-48 border-b border-r border-gray-200 bg-gray-50 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                        Employee
                                    </th>
                                    {weekDays.map((day) => {
                                        const today = isToday(day);
                                        return (
                                            <th
                                                key={day.toISOString()}
                                                className={`border-b border-gray-200 px-2 py-2.5 text-center ${today ? "bg-indigo-50/50" : "bg-gray-50"
                                                    }`}
                                            >
                                                <p
                                                    className={`text-[11px] font-medium uppercase tracking-wider ${today ? "text-[#4f46e5]" : "text-gray-400"
                                                        }`}
                                                >
                                                    {format(day, "EEE")}
                                                </p>
                                                <p
                                                    className={`text-sm font-semibold ${today ? "text-[#4f46e5]" : "text-gray-700"
                                                        }`}
                                                >
                                                    {format(day, "d")}
                                                </p>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>

                            <tbody>
                                {employees.map((employee) => {
                                    const hrs = weeklyHours[employee.id] || 0;
                                    const maxHrs = employee.maxHoursPerWeek;
                                    const isOver = hrs >= maxHrs;

                                    return (
                                        <tr key={employee.id} className="group">
                                            <td className="sticky left-0 z-10 border-b border-r border-gray-100 bg-white px-4 py-2.5">
                                                <p className="truncate text-sm font-medium text-gray-900">
                                                    {employee.fullName}
                                                </p>
                                                <div className="flex items-center gap-1.5">
                                                    <p className="truncate text-[11px] text-gray-400">
                                                        {employee.department.name}
                                                    </p>
                                                    <span className="text-[10px] text-gray-300">·</span>
                                                    <span
                                                        className={`text-[11px] font-semibold ${isOver ? "text-amber-600" : "text-gray-400"
                                                            }`}
                                                    >
                                                        {hrs}h/{maxHrs}h
                                                    </span>
                                                    {isOver && (
                                                        <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
                                                    )}
                                                </div>
                                            </td>

                                            {weekDays.map((day) => {
                                                const cellShifts = getShiftsForCell(employee.id, day);
                                                const today = isToday(day);

                                                return (
                                                    <td
                                                        key={day.toISOString()}
                                                        onClick={() => handleCellClick(employee.id, day)}
                                                        className={`border-b border-gray-100 px-1 py-1 align-top transition-colors ${today ? "bg-indigo-50/20" : ""
                                                            } cursor-pointer hover:bg-gray-50`}
                                                    >
                                                        <div className="flex min-h-[56px] flex-col gap-1 p-0.5">
                                                            {cellShifts.map((shift) => (
                                                                <div
                                                                    key={shift.id}
                                                                    className={`group/shift relative rounded-md px-2 py-1.5 ${shift.status === "PUBLISHED"
                                                                        ? "bg-emerald-50 text-emerald-700"
                                                                        : "bg-indigo-50 text-indigo-700"
                                                                        }`}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <div className="flex items-center gap-1 text-[11px] font-semibold">
                                                                        <Clock className="h-2.5 w-2.5" />
                                                                        {fmtTime(shift.startTime)}–
                                                                        {fmtTime(shift.endTime)}
                                                                    </div>
                                                                    <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide opacity-60">
                                                                        {shift.status.toLowerCase()}
                                                                    </p>

                                                                    {/* Action buttons — hover */}
                                                                    <div className="absolute -right-0.5 -top-0.5 hidden items-center gap-0.5 group-hover/shift:flex">
                                                                        <button
                                                                            onClick={() =>
                                                                                handleToggleStatus(shift)
                                                                            }
                                                                            disabled={
                                                                                actionLoading === shift.id
                                                                            }
                                                                            className={`rounded p-0.5 ${shift.status === "DRAFT"
                                                                                ? "bg-emerald-500 text-white hover:bg-emerald-600"
                                                                                : "bg-amber-500 text-white hover:bg-amber-600"
                                                                                } disabled:opacity-50`}
                                                                            title={
                                                                                shift.status === "DRAFT"
                                                                                    ? "Publish"
                                                                                    : "Unpublish"
                                                                            }
                                                                        >
                                                                            <CheckCircle2 className="h-3 w-3" />
                                                                        </button>
                                                                        <button
                                                                            onClick={() =>
                                                                                setDeleteConfirm(shift)
                                                                            }
                                                                            disabled={
                                                                                actionLoading === shift.id
                                                                            }
                                                                            className="rounded bg-red-500 p-0.5 text-white hover:bg-red-600 disabled:opacity-50"
                                                                            title="Delete"
                                                                        >
                                                                            <Trash2 className="h-3 w-3" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-5 text-[11px] text-gray-400">
                    <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm bg-indigo-100" />
                        Draft
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm bg-emerald-100" />
                        Published
                    </div>
                    <div className="flex items-center gap-1.5">
                        <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
                        Over max hours
                    </div>
                </div>
            </div>

            <AddShiftModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={fetchData}
                employees={employees}
                selectedDate={selectedDate}
                selectedEmployeeId={selectedEmployeeId}
            />

            {/* Delete Shift Confirmation */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/20"
                        onClick={() => setDeleteConfirm(null)}
                    />
                    <div className="relative w-full max-w-xs rounded-xl border border-gray-200 bg-white p-5 shadow-lg">
                        <div className="mb-3 flex items-center gap-2.5">
                            <div className="rounded-lg bg-red-50 p-2">
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-gray-900">
                                    Delete shift?
                                </p>
                                <p className="text-[11px] text-gray-500">
                                    {deleteConfirm.employee.fullName} ·{" "}
                                    {format(new Date(deleteConfirm.date), "MMM d")} ·{" "}
                                    {fmtTime(deleteConfirm.startTime)}–
                                    {fmtTime(deleteConfirm.endTime)}
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteShift(deleteConfirm.id)}
                                disabled={actionLoading === deleteConfirm.id}
                                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                                {actionLoading === deleteConfirm.id ? "Deleting…" : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
