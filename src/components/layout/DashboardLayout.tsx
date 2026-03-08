"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import {
    LayoutDashboard,
    Users,
    Building2,
    CalendarDays,
    CalendarOff,
    LogOut,
    Menu,
    X,
    ChevronRight,
    UserCircle,
    ClipboardList,
    ArrowLeftRight,
    DollarSign,
} from "lucide-react";

// roles: which roles can SEE this nav item
const allNavigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard, roles: ["ADMIN", "MANAGER", "STAFF"] },
    { name: "Departments", href: "/departments", icon: Building2, roles: ["ADMIN"] },
    { name: "Employees", href: "/employees", icon: Users, roles: ["ADMIN", "MANAGER"] },
    { name: "Leave Requests", href: "/leaves", icon: CalendarOff, roles: ["ADMIN", "MANAGER", "STAFF"] },
    { name: "Schedule", href: "/schedule", icon: CalendarDays, roles: ["ADMIN", "MANAGER", "STAFF"] },
    { name: "Registrations", href: "/registrations", icon: ClipboardList, roles: ["ADMIN", "MANAGER", "STAFF"] },
    { name: "Swap Requests", href: "/swaps", icon: ArrowLeftRight, roles: ["ADMIN", "MANAGER", "STAFF"] },
    { name: "Payroll", href: "/payroll", icon: DollarSign, roles: ["ADMIN", "MANAGER", "STAFF"] },
    { name: "Profile", href: "/profile", icon: UserCircle, roles: ["ADMIN", "MANAGER", "STAFF"] },
];

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { data: session, status } = useSession();
    const pathname = usePathname();
    const router = useRouter();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const role = session?.user.role || "STAFF";

    // Filter nav items by current user role
    const navigation = useMemo(
        () => allNavigation.filter((item) => item.roles.includes(role)),
        [role]
    );

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        }
    }, [status, router]);

    if (status === "loading") {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
            </div>
        );
    }

    if (!session) return null;

    return (
        <div className="flex h-screen overflow-hidden bg-[#f9fafb]">
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/20 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-gray-200 bg-white transition-transform duration-200 lg:static lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"
                    }`}
            >
                {/* Brand */}
                <div className="flex h-14 items-center gap-2.5 border-b border-gray-100 px-5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#4f46e5]">
                        <CalendarDays className="h-3.5 w-3.5 text-white" />
                    </div>
                    <span className="text-sm font-semibold text-gray-900">ESMS</span>
                    <button
                        className="ml-auto text-gray-400 lg:hidden"
                        onClick={() => setSidebarOpen(false)}
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Nav — filtered by role */}
                <nav className="flex-1 space-y-0.5 px-3 py-3">
                    {navigation.map((item) => {
                        const isActive =
                            item.href === "/"
                                ? pathname === "/"
                                : pathname.startsWith(item.href);
                        return (
                            <a
                                key={item.name}
                                href={item.href}
                                onClick={() => setSidebarOpen(false)}
                                className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${isActive
                                    ? "bg-gray-100 text-gray-900"
                                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                                    }`}
                            >
                                <item.icon
                                    className={`h-4 w-4 ${isActive ? "text-gray-700" : "text-gray-400 group-hover:text-gray-600"
                                        }`}
                                />
                                {item.name}
                                {isActive && (
                                    <ChevronRight className="ml-auto h-3 w-3 text-gray-400" />
                                )}
                            </a>
                        );
                    })}
                </nav>

                {/* User */}
                <div className="border-t border-gray-100 p-3">
                    <a href="/profile" className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-gray-50">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                            {session.user.email?.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium text-gray-900">
                                {session.user.email}
                            </p>
                            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                                {session.user.role}
                            </p>
                        </div>
                    </a>
                    <button
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
                    >
                        <LogOut className="h-3.5 w-3.5" />
                        Sign out
                    </button>
                </div>
            </aside>

            {/* Main */}
            <div className="flex flex-1 flex-col overflow-hidden">
                {/* Topbar */}
                <header className="flex h-14 items-center gap-4 border-b border-gray-200 bg-white px-4 lg:px-6">
                    <button
                        className="text-gray-500 lg:hidden"
                        onClick={() => setSidebarOpen(true)}
                    >
                        <Menu className="h-5 w-5" />
                    </button>

                    {/* Breadcrumb */}
                    <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-gray-400">ESMS</span>
                        <ChevronRight className="h-3 w-3 text-gray-300" />
                        <span className="font-medium text-gray-700">
                            {allNavigation.find(
                                (n) =>
                                    n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)
                            )?.name || "Dashboard"}
                        </span>
                    </div>

                    <div className="flex-1" />

                    {/* Role badge */}
                    <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${session.user.role === "ADMIN"
                            ? "bg-red-50 text-red-600"
                            : session.user.role === "MANAGER"
                                ? "bg-amber-50 text-amber-600"
                                : "bg-blue-50 text-blue-600"
                            }`}
                    >
                        {session.user.role}
                    </span>
                </header>

                {/* Content */}
                <main className="flex-1 overflow-auto p-5 lg:p-6">{children}</main>
            </div>
        </div>
    );
}
