"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
    User,
    Mail,
    Building2,
    Clock,
    Shield,
    Key,
    Check,
    AlertTriangle,
    Eye,
    EyeOff,
} from "lucide-react";
import { format } from "date-fns";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface ProfileData {
    id: string;
    email: string;
    role: string;
    createdAt: string;
    employee: {
        fullName: string;
        maxHoursPerWeek: number;
        department: { name: string };
    } | null;
}

export default function ProfilePage() {
    const { data: session } = useSession();
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(true);

    // Password form
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [pwLoading, setPwLoading] = useState(false);
    const [pwError, setPwError] = useState("");
    const [pwSuccess, setPwSuccess] = useState(false);

    const fetchProfile = useCallback(async () => {
        try {
            const res = await fetch("/api/profile");
            if (res.ok) setProfile(await res.json());
        } catch (err) {
            console.error("Fetch failed:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProfile();
    }, [fetchProfile]);

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setPwError("");
        setPwSuccess(false);

        if (newPassword.length < 6) {
            setPwError("New password must be at least 6 characters");
            return;
        }
        if (newPassword !== confirmPassword) {
            setPwError("Passwords do not match");
            return;
        }

        setPwLoading(true);
        try {
            const res = await fetch("/api/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const data = await res.json();

            if (!res.ok) {
                setPwError(data.error || "Failed to change password");
                setPwLoading(false);
                return;
            }

            setPwSuccess(true);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setTimeout(() => setPwSuccess(false), 3000);
        } catch {
            setPwError("Network error");
        } finally {
            setPwLoading(false);
        }
    };

    const roleBadge = (role: string) => {
        const map: Record<string, string> = {
            ADMIN: "bg-red-50 text-red-600",
            MANAGER: "bg-amber-50 text-amber-600",
            STAFF: "bg-blue-50 text-blue-600",
        };
        return map[role] || "bg-gray-50 text-gray-600";
    };

    return (
        <DashboardLayout>
            <div className="mx-auto max-w-xl space-y-5">
                <div>
                    <h1 className="text-lg font-semibold text-gray-900">My Profile</h1>
                    <p className="text-sm text-gray-500">
                        View your information and manage your password
                    </p>
                </div>

                {/* Profile Card */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                    {loading ? (
                        <div className="flex h-48 items-center justify-center">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
                        </div>
                    ) : profile ? (
                        <div className="divide-y divide-gray-100">
                            {/* Avatar + Name */}
                            <div className="flex items-center gap-4 p-5">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#4f46e5] text-lg font-semibold text-white">
                                    {(
                                        profile.employee?.fullName || profile.email
                                    )
                                        .charAt(0)
                                        .toUpperCase()}
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-900">
                                        {profile.employee?.fullName || profile.email}
                                    </p>
                                    <span
                                        className={`mt-0.5 inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${roleBadge(
                                            profile.role
                                        )}`}
                                    >
                                        {profile.role}
                                    </span>
                                </div>
                            </div>

                            {/* Info rows */}
                            <div className="space-y-0 divide-y divide-gray-50">
                                <InfoRow
                                    icon={Mail}
                                    label="Email"
                                    value={profile.email}
                                />
                                <InfoRow
                                    icon={Shield}
                                    label="Role"
                                    value={profile.role}
                                />
                                {profile.employee && (
                                    <>
                                        <InfoRow
                                            icon={Building2}
                                            label="Department"
                                            value={profile.employee.department.name}
                                        />
                                        <InfoRow
                                            icon={Clock}
                                            label="Max Hours/Week"
                                            value={`${profile.employee.maxHoursPerWeek}h`}
                                        />
                                    </>
                                )}
                                <InfoRow
                                    icon={User}
                                    label="Member Since"
                                    value={format(new Date(profile.createdAt), "MMM d, yyyy")}
                                />
                            </div>
                        </div>
                    ) : (
                        <p className="p-5 text-sm text-gray-400">
                            Failed to load profile
                        </p>
                    )}
                </div>

                {/* Change Password */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="border-b border-gray-100 px-5 py-4">
                        <div className="flex items-center gap-2">
                            <Key className="h-4 w-4 text-gray-400" />
                            <h2 className="text-sm font-semibold text-gray-900">
                                Change Password
                            </h2>
                        </div>
                    </div>

                    <form onSubmit={handlePasswordChange} className="p-5">
                        {pwError && (
                            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                                <p className="text-sm text-red-700">{pwError}</p>
                            </div>
                        )}
                        {pwSuccess && (
                            <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
                                <Check className="h-3.5 w-3.5 text-green-600" />
                                <p className="text-sm text-green-700">
                                    Password changed successfully
                                </p>
                            </div>
                        )}

                        <div className="space-y-3">
                            {/* Current Password */}
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                    Current Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showCurrent ? "text" : "password"}
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-9 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCurrent(!showCurrent)}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {showCurrent ? (
                                            <EyeOff className="h-3.5 w-3.5" />
                                        ) : (
                                            <Eye className="h-3.5 w-3.5" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* New Password */}
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                    New Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showNew ? "text" : "password"}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="Min. 6 characters"
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-9 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                        required
                                        minLength={6}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNew(!showNew)}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {showNew ? (
                                            <EyeOff className="h-3.5 w-3.5" />
                                        ) : (
                                            <Eye className="h-3.5 w-3.5" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Confirm Password */}
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                    Confirm New Password
                                </label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-indigo-100"
                                    required
                                />
                            </div>
                        </div>

                        <div className="mt-5 flex justify-end">
                            <button
                                type="submit"
                                disabled={pwLoading}
                                className="rounded-lg bg-[#4f46e5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338ca] disabled:opacity-50"
                            >
                                {pwLoading ? "Changing…" : "Change Password"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </DashboardLayout>
    );
}

function InfoRow({
    icon: Icon,
    label,
    value,
}: {
    icon: React.ElementType;
    label: string;
    value: string;
}) {
    return (
        <div className="flex items-center gap-3 px-5 py-3">
            <Icon className="h-3.5 w-3.5 text-gray-400" />
            <span className="w-28 text-xs font-medium text-gray-400">{label}</span>
            <span className="text-sm text-gray-900">{value}</span>
        </div>
    );
}
