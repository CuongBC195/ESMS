"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
    Building2,
    Plus,
    Pencil,
    Trash2,
    X,
    AlertTriangle,
    Check,
    Clock,
    Users,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface ShiftTemplate {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
}

interface Department {
    id: string;
    name: string;
    _count: { employees: number };
    shiftTemplates: ShiftTemplate[];
}

interface TemplateInput {
    name: string;
    startTime: string;
    endTime: string;
}

export default function DepartmentsPage() {
    const { data: session } = useSession();
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(true);
    const [addOpen, setAddOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Department | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);

    const isAdmin = session?.user.role === "ADMIN";

    const fetchDepartments = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/departments");
            if (res.ok) setDepartments(await res.json());
        } catch (err) {
            console.error("Fetch failed:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDepartments();
    }, [fetchDepartments]);

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-5">
                {/* Header */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">
                            Departments
                        </h1>
                        <p className="text-sm text-gray-500">
                            {departments.length} department
                            {departments.length !== 1 ? "s" : ""}
                        </p>
                    </div>
                    {isAdmin && (
                        <button
                            onClick={() => setAddOpen(true)}
                            className="flex items-center gap-1.5 rounded-lg bg-[#4f46e5] px-3 py-2 text-xs font-medium text-white hover:bg-[#4338ca]"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Add Department
                        </button>
                    )}
                </div>

                {/* Table */}
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    {loading ? (
                        <div className="flex h-48 items-center justify-center">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
                        </div>
                    ) : departments.length === 0 ? (
                        <div className="flex h-48 flex-col items-center justify-center gap-1.5 text-gray-400">
                            <Building2 className="h-8 w-8" />
                            <p className="text-sm">No departments yet</p>
                            {isAdmin && (
                                <p className="text-xs">
                                    Create a department to start adding employees
                                </p>
                            )}
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-gray-200 bg-gray-50">
                                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                        Department
                                    </th>
                                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                        Employees
                                    </th>
                                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                        Shift Templates
                                    </th>
                                    {isAdmin && (
                                        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                            Actions
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {departments.map((dept) => (
                                    <tr
                                        key={dept.id}
                                        className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50"
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2.5">
                                                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                                                    <Building2 className="h-3.5 w-3.5" />
                                                </div>
                                                <span className="text-sm font-medium text-gray-900">
                                                    {dept.name}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5 text-sm text-gray-500">
                                                <Users className="h-3 w-3" />
                                                {dept._count.employees}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {dept.shiftTemplates.length === 0 ? (
                                                <span className="text-xs text-gray-300">
                                                    No templates
                                                </span>
                                            ) : (
                                                <div className="flex flex-wrap gap-1">
                                                    {dept.shiftTemplates.map((t) => (
                                                        <span
                                                            key={t.id}
                                                            className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600"
                                                        >
                                                            {t.name} ({t.startTime}–{t.endTime})
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                        {isAdmin && (
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => setEditTarget(dept)}
                                                        className="rounded-md p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-500"
                                                        title="Edit"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteTarget(dept)}
                                                        className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {addOpen && (
                <DepartmentFormModal
                    mode="add"
                    onClose={() => setAddOpen(false)}
                    onSuccess={fetchDepartments}
                />
            )}

            {editTarget && (
                <DepartmentFormModal
                    mode="edit"
                    department={editTarget}
                    onClose={() => setEditTarget(null)}
                    onSuccess={fetchDepartments}
                />
            )}

            {deleteTarget && (
                <DeleteDeptModal
                    department={deleteTarget}
                    onClose={() => setDeleteTarget(null)}
                    onSuccess={fetchDepartments}
                />
            )}
        </DashboardLayout>
    );
}

/* ────────────────── Department Form Modal (Add / Edit) ──────────── */

function DepartmentFormModal({
    mode,
    department,
    onClose,
    onSuccess,
}: {
    mode: "add" | "edit";
    department?: Department;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [name, setName] = useState(department?.name || "");
    const [templates, setTemplates] = useState<TemplateInput[]>(
        department?.shiftTemplates.map((t) => ({
            name: t.name,
            startTime: t.startTime,
            endTime: t.endTime,
        })) || []
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    const addTemplate = () =>
        setTemplates([...templates, { name: "", startTime: "09:00", endTime: "17:00" }]);

    const removeTemplate = (i: number) =>
        setTemplates(templates.filter((_, idx) => idx !== i));

    const updateTemplate = (i: number, key: keyof TemplateInput, val: string) =>
        setTemplates(templates.map((t, idx) => (idx === i ? { ...t, [key]: val } : t)));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        if (!name.trim()) {
            setError("Department name is required");
            setLoading(false);
            return;
        }

        // Validate templates
        for (const t of templates) {
            if (!t.name.trim() || !t.startTime || !t.endTime) {
                setError("Each template needs a name, start time, and end time");
                setLoading(false);
                return;
            }
        }

        try {
            const url =
                mode === "add"
                    ? "/api/departments"
                    : `/api/departments/${department!.id}`;
            const method = mode === "add" ? "POST" : "PATCH";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    shiftTemplates: templates,
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || `Failed to ${mode} department`);
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
            <div className="relative w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-lg">
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                    <div>
                        <h2 className="text-sm font-semibold text-gray-900">
                            {mode === "add" ? "Add Department" : "Edit Department"}
                        </h2>
                        <p className="text-xs text-gray-500">
                            {mode === "add"
                                ? "Create a department with shift templates"
                                : `Editing ${department?.name}`}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-md p-1 text-gray-400 hover:bg-gray-100"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto p-5">
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
                                Department {mode === "add" ? "created" : "updated"}
                            </p>
                        </div>
                    )}

                    {/* Department Name */}
                    <div className="mb-5">
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                            Department Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Engineering"
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                            required
                            autoFocus
                        />
                    </div>

                    {/* Shift Templates Section */}
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                                <Clock className="h-3 w-3 text-gray-400" />
                                Shift Templates
                            </label>
                            <button
                                type="button"
                                onClick={addTemplate}
                                className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-200"
                            >
                                <Plus className="h-2.5 w-2.5" />
                                Add Slot
                            </button>
                        </div>

                        {templates.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                                No shift templates yet. Add slots to define working hours.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {templates.map((t, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2.5"
                                    >
                                        <input
                                            type="text"
                                            value={t.name}
                                            onChange={(e) => updateTemplate(i, "name", e.target.value)}
                                            placeholder="Slot name (e.g. Morning)"
                                            className="w-28 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#4f46e5]"
                                            required
                                        />
                                        <input
                                            type="time"
                                            value={t.startTime}
                                            onChange={(e) =>
                                                updateTemplate(i, "startTime", e.target.value)
                                            }
                                            className="w-24 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#4f46e5]"
                                            required
                                        />
                                        <span className="text-[10px] text-gray-400">to</span>
                                        <input
                                            type="time"
                                            value={t.endTime}
                                            onChange={(e) =>
                                                updateTemplate(i, "endTime", e.target.value)
                                            }
                                            className="w-24 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#4f46e5]"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeTemplate(i)}
                                            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
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
                                ? "Saving…"
                                : success
                                    ? "Done"
                                    : mode === "add"
                                        ? "Create"
                                        : "Save Changes"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ────────────────── Delete Confirmation ────────────────── */

function DeleteDeptModal({
    department,
    onClose,
    onSuccess,
}: {
    department: Department;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleDelete = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/departments/${department.id}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                const data = await res.json();
                setError(data.error || "Failed to delete");
                setLoading(false);
                return;
            }
            onSuccess();
            onClose();
        } catch {
            setError("Network error");
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/20" onClick={onClose} />
            <div className="relative w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-lg">
                <div className="mb-4 flex items-center gap-3">
                    <div className="rounded-lg bg-red-50 p-2">
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900">
                            Delete Department
                        </h3>
                        <p className="text-xs text-gray-500">
                            This action cannot be undone
                        </p>
                    </div>
                </div>

                <p className="mb-1 text-sm text-gray-600">
                    Are you sure you want to delete{" "}
                    <span className="font-semibold text-gray-900">{department.name}</span>
                    ?
                </p>
                {department._count.employees > 0 && (
                    <p className="mb-3 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
                        ⚠ This department has {department._count.employees} employee(s).
                        They must be reassigned first.
                    </p>
                )}

                {error && (
                    <p className="mb-3 text-sm text-red-600">{error}</p>
                )}

                <div className="mt-4 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={loading}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                        {loading ? "Deleting…" : "Delete"}
                    </button>
                </div>
            </div>
        </div>
    );
}
