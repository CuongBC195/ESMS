"use client";

import { useState, useCallback, useEffect } from "react";
import { X, AlertTriangle, Check, Clock, Zap } from "lucide-react";

interface Employee {
    id: string;
    fullName: string;
    user: { email: string };
    department: { id: string; name: string };
}

interface ShiftTemplate {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
}

interface AddShiftModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    employees: Employee[];
    selectedDate?: string;
    selectedEmployeeId?: string;
}

export default function AddShiftModal({
    isOpen,
    onClose,
    onSuccess,
    employees,
    selectedDate,
    selectedEmployeeId,
}: AddShiftModalProps) {
    const [employeeId, setEmployeeId] = useState(selectedEmployeeId || "");
    const [date, setDate] = useState(selectedDate || "");
    const [startTime, setStartTime] = useState("09:00");
    const [endTime, setEndTime] = useState("17:00");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [templates, setTemplates] = useState<ShiftTemplate[]>([]);

    // ─── Fix: Sync props → state whenever they change ──────────
    useEffect(() => {
        if (isOpen) {
            setEmployeeId(selectedEmployeeId || "");
            setDate(selectedDate || "");
            setStartTime("09:00");
            setEndTime("17:00");
            setError("");
            setSuccess(false);
            setLoading(false);
        }
    }, [isOpen, selectedDate, selectedEmployeeId]);

    // ─── Load templates for selected employee's department ─────
    const selectedEmployee = employees.find((e) => e.id === employeeId);

    const fetchTemplates = useCallback(async (deptId: string) => {
        try {
            const res = await fetch("/api/departments");
            if (res.ok) {
                const depts = await res.json();
                const dept = depts.find(
                    (d: { id: string; shiftTemplates: ShiftTemplate[] }) =>
                        d.id === deptId
                );
                setTemplates(dept?.shiftTemplates || []);
            }
        } catch {
            setTemplates([]);
        }
    }, []);

    useEffect(() => {
        if (selectedEmployee?.department.id) {
            fetchTemplates(selectedEmployee.department.id);
        } else {
            setTemplates([]);
        }
    }, [employeeId, selectedEmployee?.department.id, fetchTemplates]);

    if (!isOpen) return null;

    const handleTemplateClick = (t: ShiftTemplate) => {
        setStartTime(t.startTime);
        setEndTime(t.endTime);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess(false);
        setLoading(true);

        if (!employeeId || !date || !startTime || !endTime) {
            setError("All fields are required");
            setLoading(false);
            return;
        }

        const shiftStart = new Date(`${date}T${startTime}:00`);
        const shiftEnd = new Date(`${date}T${endTime}:00`);

        if (shiftEnd <= shiftStart) {
            setError("End time must be after start time");
            setLoading(false);
            return;
        }

        try {
            const res = await fetch("/api/shifts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    employeeId,
                    departmentId: selectedEmployee?.department.id,
                    date: new Date(`${date}T00:00:00`).toISOString(),
                    startTime: shiftStart.toISOString(),
                    endTime: shiftEnd.toISOString(),
                }),
            });

            const data = await res.json();

            if (res.status === 409) {
                setError(data.error || "Schedule conflict detected");
                setLoading(false);
                return;
            }

            if (!res.ok) {
                setError(data.error || "Failed to create shift");
                setLoading(false);
                return;
            }

            setSuccess(true);
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 600);
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/20" onClick={handleClose} />

            <div className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-lg">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                    <div>
                        <h2 className="text-sm font-semibold text-gray-900">New Shift</h2>
                        <p className="text-xs text-gray-500">
                            Assign a shift to an employee
                        </p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5">
                    {/* Error — 409 conflict */}
                    {error && (
                        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}

                    {/* Success */}
                    {success && (
                        <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
                            <Check className="h-3.5 w-3.5 text-green-600" />
                            <p className="text-sm text-green-700">Shift created</p>
                        </div>
                    )}

                    <div className="space-y-3.5">
                        {/* Employee */}
                        <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">
                                Employee
                            </label>
                            <select
                                value={employeeId}
                                onChange={(e) => setEmployeeId(e.target.value)}
                                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                required
                            >
                                <option value="">Select employee…</option>
                                {employees.map((emp) => (
                                    <option key={emp.id} value={emp.id}>
                                        {emp.fullName} — {emp.department.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Date */}
                        <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">
                                Date
                            </label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                min={new Date().toISOString().split("T")[0]}
                                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                required
                            />
                        </div>

                        {/* Quick Template Buttons */}
                        {templates.length > 0 && (
                            <div>
                                <label className="mb-1.5 flex items-center gap-1 text-xs font-medium text-gray-700">
                                    <Zap className="h-3 w-3 text-amber-500" />
                                    Quick Select
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {templates.map((t) => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => handleTemplateClick(t)}
                                            className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${startTime === t.startTime && endTime === t.endTime
                                                    ? "bg-[#4f46e5] text-white"
                                                    : "bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700"
                                                }`}
                                        >
                                            {t.name} ({t.startTime}–{t.endTime})
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Time */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                    Start
                                </label>
                                <div className="relative">
                                    <input
                                        type="time"
                                        value={startTime}
                                        onChange={(e) => setStartTime(e.target.value)}
                                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                    End
                                </label>
                                <input
                                    type="time"
                                    value={endTime}
                                    onChange={(e) => setEndTime(e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                    required
                                />
                            </div>
                        </div>

                        {/* Selected preview */}
                        {employeeId && date && (
                            <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
                                <div className="flex items-center gap-1.5">
                                    <Clock className="h-3 w-3" />
                                    <span className="font-medium text-gray-700">
                                        {selectedEmployee?.fullName}
                                    </span>
                                    <span>·</span>
                                    <span>{date}</span>
                                    <span>·</span>
                                    <span>
                                        {startTime} – {endTime}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="mt-5 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || success}
                            className="rounded-lg bg-[#4f46e5] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#4338ca] disabled:opacity-50"
                        >
                            {loading ? "Creating…" : success ? "Done" : "Create shift"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
