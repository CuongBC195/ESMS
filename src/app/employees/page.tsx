"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
    Users,
    Plus,
    Trash2,
    Pencil,
    Search,
    X,
    AlertTriangle,
    Check,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface Employee {
    id: string;
    fullName: string;
    maxHoursPerWeek: number;
    hourlyRate: number;
    overtimeMultiplier: number;
    user: { email: string; role: string };
    department: { id: string; name: string };
}

interface Department {
    id: string;
    name: string;
}

export default function EmployeesPage() {
    const { data: session } = useSession();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [addOpen, setAddOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Employee | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);

    const canManage =
        session?.user.role === "ADMIN" || session?.user.role === "MANAGER";
    const isManager = session?.user.role === "MANAGER";

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [empRes, deptRes] = await Promise.all([
                fetch("/api/employees"),
                fetch("/api/departments"),
            ]);
            if (empRes.ok) setEmployees(await empRes.json());
            if (deptRes.ok) setDepartments(await deptRes.json());
        } catch (err) {
            console.error("Fetch failed:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filtered = employees.filter(
        (e) =>
            e.fullName.toLowerCase().includes(search.toLowerCase()) ||
            e.user.email.toLowerCase().includes(search.toLowerCase()) ||
            e.department.name.toLowerCase().includes(search.toLowerCase())
    );

    const roleBadge = (role: string) => {
        const colors: Record<string, string> = {
            ADMIN: "bg-red-50 text-red-600",
            MANAGER: "bg-amber-50 text-amber-600",
            STAFF: "bg-blue-50 text-blue-600",
        };
        return colors[role] || "bg-gray-50 text-gray-600";
    };

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-5">
                {/* Header */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">Employees</h1>
                        <p className="text-sm text-gray-500">
                            {employees.length} employee{employees.length !== 1 ? "s" : ""}{" "}
                            registered
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-48 rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-xs text-gray-900 outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                            />
                        </div>
                        {canManage && (
                            <button
                                onClick={() => setAddOpen(true)}
                                className="flex items-center gap-1.5 rounded-lg bg-[#4f46e5] px-3 py-2 text-xs font-medium text-white hover:bg-[#4338ca]"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Add Employee
                            </button>
                        )}
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    {loading ? (
                        <div className="flex h-48 items-center justify-center">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex h-48 flex-col items-center justify-center gap-1.5 text-gray-400">
                            <Users className="h-8 w-8" />
                            <p className="text-sm">
                                {search ? "No results found" : "No employees yet"}
                            </p>
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-gray-200 bg-gray-50">
                                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                        Name
                                    </th>
                                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                        Email
                                    </th>
                                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                        Department
                                    </th>
                                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                        Role
                                    </th>
                                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                        Max Hrs
                                    </th>
                                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                        Rate/Hr
                                    </th>
                                    {canManage && (
                                        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                            Actions
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((emp) => (
                                    <tr
                                        key={emp.id}
                                        className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50"
                                    >
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                            {emp.fullName}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {emp.user.email}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {emp.department.name}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${roleBadge(
                                                    emp.user.role
                                                )}`}
                                            >
                                                {emp.user.role}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {emp.maxHoursPerWeek}h
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {emp.hourlyRate > 0 ? (
                                                <span>${emp.hourlyRate}<span className="text-[10px] text-gray-400"> (×{emp.overtimeMultiplier} OT)</span></span>
                                            ) : (
                                                <span className="text-gray-300">—</span>
                                            )}
                                        </td>
                                        {canManage && (
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => setEditTarget(emp)}
                                                        className="rounded-md p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-500"
                                                        title="Edit"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteTarget(emp)}
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
                <AddEmployeeModal
                    departments={departments}
                    isManager={isManager}
                    onClose={() => setAddOpen(false)}
                    onSuccess={fetchData}
                />
            )}

            {editTarget && (
                <EditEmployeeModal
                    employee={editTarget}
                    departments={departments}
                    isManager={isManager}
                    onClose={() => setEditTarget(null)}
                    onSuccess={fetchData}
                />
            )}

            {deleteTarget && (
                <DeleteConfirmModal
                    employee={deleteTarget}
                    onClose={() => setDeleteTarget(null)}
                    onSuccess={fetchData}
                />
            )}
        </DashboardLayout>
    );
}

/* ────────────────── Add Employee Modal ────────────────── */

function AddEmployeeModal({
    departments,
    isManager,
    onClose,
    onSuccess,
}: {
    departments: Department[];
    isManager: boolean;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [form, setForm] = useState({
        fullName: "",
        email: "",
        password: "",
        role: "STAFF",
        departmentId: "",
        maxHoursPerWeek: 40,
        hourlyRate: 0,
        overtimeMultiplier: 1.5,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    const set = (key: string, value: string | number) =>
        setForm((f) => ({ ...f, [key]: value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const res = await fetch("/api/employees", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Failed to create employee");
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
            <div className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-lg">
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                    <h2 className="text-sm font-semibold text-gray-900">Add Employee</h2>
                    <button
                        onClick={onClose}
                        className="rounded-md p-1 text-gray-400 hover:bg-gray-100"
                    >
                        <X className="h-4 w-4" />
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
                            <p className="text-sm text-green-700">Employee created</p>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">
                                Full Name
                            </label>
                            <input
                                type="text"
                                value={form.fullName}
                                onChange={(e) => set("fullName", e.target.value)}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                    Email
                                </label>
                                <input
                                    type="text"
                                    value={form.email}
                                    onChange={(e) => set("email", e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                    required
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                    Password
                                </label>
                                <input
                                    type="password"
                                    value={form.password}
                                    onChange={(e) => set("password", e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                    Role
                                </label>
                                <select
                                    value={form.role}
                                    onChange={(e) => set("role", e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                    disabled={isManager}
                                >
                                    <option value="STAFF">Staff</option>
                                    {!isManager && <option value="MANAGER">Manager</option>}
                                    {!isManager && <option value="ADMIN">Admin</option>}
                                </select>
                                {isManager && (
                                    <p className="mt-0.5 text-[10px] text-gray-400">
                                        Managers can only create Staff
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                    Max Hours/Week
                                </label>
                                <input
                                    type="number"
                                    value={form.maxHoursPerWeek}
                                    onChange={(e) =>
                                        set("maxHoursPerWeek", parseInt(e.target.value) || 40)
                                    }
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">
                                Department
                            </label>
                            <select
                                value={form.departmentId}
                                onChange={(e) => set("departmentId", e.target.value)}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                required
                            >
                                <option value="">Select department…</option>
                                {departments.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                    Hourly Rate ($)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={form.hourlyRate}
                                    onChange={(e) =>
                                        set("hourlyRate", parseFloat(e.target.value) || 0)
                                    }
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                    placeholder="e.g. 15.00"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                    OT Multiplier
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="1"
                                    value={form.overtimeMultiplier}
                                    onChange={(e) =>
                                        set("overtimeMultiplier", parseFloat(e.target.value) || 1.5)
                                    }
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                    placeholder="e.g. 1.5"
                                />
                                <p className="mt-0.5 text-[10px] text-gray-400">
                                    Overtime pay = rate × this
                                </p>
                            </div>
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
                            {loading ? "Creating…" : success ? "Done" : "Create"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ────────────────── Edit Employee Modal ────────────────── */

function EditEmployeeModal({
    employee,
    departments,
    isManager,
    onClose,
    onSuccess,
}: {
    employee: Employee;
    departments: Department[];
    isManager: boolean;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [form, setForm] = useState({
        fullName: employee.fullName,
        role: employee.user.role,
        departmentId: employee.department.id,
        maxHoursPerWeek: employee.maxHoursPerWeek,
        hourlyRate: employee.hourlyRate || 0,
        overtimeMultiplier: employee.overtimeMultiplier || 1.5,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    const set = (key: string, value: string | number) =>
        setForm((f) => ({ ...f, [key]: value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const res = await fetch(`/api/employees/${employee.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Failed to update employee");
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
            <div className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-lg">
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                    <div>
                        <h2 className="text-sm font-semibold text-gray-900">
                            Edit Employee
                        </h2>
                        <p className="text-xs text-gray-500">{employee.user.email}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-md p-1 text-gray-400 hover:bg-gray-100"
                    >
                        <X className="h-4 w-4" />
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
                            <p className="text-sm text-green-700">Employee updated</p>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">
                                Full Name
                            </label>
                            <input
                                type="text"
                                value={form.fullName}
                                onChange={(e) => set("fullName", e.target.value)}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                    Role
                                </label>
                                <select
                                    value={form.role}
                                    onChange={(e) => set("role", e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                    disabled={isManager}
                                >
                                    <option value="STAFF">Staff</option>
                                    <option value="MANAGER">Manager</option>
                                    {!isManager && <option value="ADMIN">Admin</option>}
                                </select>
                                {isManager && (
                                    <p className="mt-0.5 text-[10px] text-gray-400">
                                        Only admins can change roles
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                    Max Hours/Week
                                </label>
                                <input
                                    type="number"
                                    value={form.maxHoursPerWeek}
                                    onChange={(e) =>
                                        set("maxHoursPerWeek", parseInt(e.target.value) || 40)
                                    }
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">
                                Department
                            </label>
                            <select
                                value={form.departmentId}
                                onChange={(e) => set("departmentId", e.target.value)}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                disabled={isManager}
                                required
                            >
                                {departments.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.name}
                                    </option>
                                ))}
                            </select>
                            {isManager && (
                                <p className="mt-0.5 text-[10px] text-gray-400">
                                    Only admins can change departments
                                </p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                    Hourly Rate ($)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={form.hourlyRate}
                                    onChange={(e) =>
                                        set("hourlyRate", parseFloat(e.target.value) || 0)
                                    }
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                    OT Multiplier
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="1"
                                    value={form.overtimeMultiplier}
                                    onChange={(e) =>
                                        set("overtimeMultiplier", parseFloat(e.target.value) || 1.5)
                                    }
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                />
                                <p className="mt-0.5 text-[10px] text-gray-400">
                                    Overtime pay = rate × this
                                </p>
                            </div>
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
                            {loading ? "Saving…" : success ? "Done" : "Save Changes"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ────────────────── Delete Confirmation ────────────────── */

function DeleteConfirmModal({
    employee,
    onClose,
    onSuccess,
}: {
    employee: Employee;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleDelete = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/employees/${employee.id}`, {
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
                            Delete Employee
                        </h3>
                        <p className="text-xs text-gray-500">
                            This action cannot be undone
                        </p>
                    </div>
                </div>

                <p className="mb-1 text-sm text-gray-600">
                    Are you sure you want to delete{" "}
                    <span className="font-semibold text-gray-900">
                        {employee.fullName}
                    </span>
                    ?
                </p>
                <p className="mb-4 text-xs text-gray-400">
                    This will also remove their user account, shifts, and leave requests.
                </p>

                {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

                <div className="flex justify-end gap-2">
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
