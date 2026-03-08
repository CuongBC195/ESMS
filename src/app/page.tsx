"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Users,
  Building2,
  CalendarDays,
  Clock,
  CalendarCheck,
  ArrowUpRight,
  ClipboardList,
  ArrowLeftRight,
  CalendarOff,
} from "lucide-react";
import { format } from "date-fns";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface WeeklyData {
  day: string;
  shifts: number;
}

interface ActivityItem {
  id: string;
  type: "registration" | "swap" | "leave";
  user: string;
  status: string;
  time: string;
}

interface AdminStats {
  type: "system";
  employeeCount: number;
  departmentCount: number;
  shiftsThisWeek: number;
  pendingLeaves: number;
  weeklyDistribution: WeeklyData[];
  recentActivity: ActivityItem[];
}

interface ManagerStats {
  type: "department";
  departmentName: string;
  deptEmployees: number;
  deptShiftsThisWeek: number;
  deptPendingLeaves: number;
  weeklyDistribution: WeeklyData[];
  recentActivity: ActivityItem[];
}

interface StaffStats {
  type: "personal";
  myShiftsThisWeek: number;
  myPendingLeaves: number;
  nextShift: { date: string; startTime: string; endTime: string } | null;
  weeklyDistribution: WeeklyData[];
}

type Stats = AdminStats | ManagerStats | StaffStats;

export default function HomePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const role = session?.user.role;

  const getCards = () => {
    if (!stats) return [];

    if (stats.type === "system") {
      return [
        { label: "Total Employees", value: stats.employeeCount, icon: Users, color: "text-indigo-600 bg-indigo-50", href: "/employees" },
        { label: "Departments", value: stats.departmentCount, icon: Building2, color: "text-blue-600 bg-blue-50", href: "/departments" },
        { label: "Shifts This Week", value: stats.shiftsThisWeek, icon: CalendarDays, color: "text-emerald-600 bg-emerald-50", href: "/schedule" },
        { label: "Pending Leaves", value: stats.pendingLeaves, icon: Clock, color: "text-amber-600 bg-amber-50", href: "/leaves" },
      ];
    }

    if (stats.type === "department") {
      return [
        { label: `${stats.departmentName} Staff`, value: stats.deptEmployees, icon: Users, color: "text-indigo-600 bg-indigo-50", href: "/employees" },
        { label: "Dept Shifts", value: stats.deptShiftsThisWeek, icon: CalendarDays, color: "text-emerald-600 bg-emerald-50", href: "/schedule" },
        { label: "Pending Leaves", value: stats.deptPendingLeaves, icon: Clock, color: "text-amber-600 bg-amber-50", href: "/leaves" },
      ];
    }

    if (stats.type === "personal") {
      return [
        { label: "My Shifts", value: stats.myShiftsThisWeek, icon: CalendarDays, color: "text-indigo-600 bg-indigo-50", href: "/schedule" },
        { label: "Pending Leaves", value: stats.myPendingLeaves, icon: Clock, color: "text-amber-600 bg-amber-50", href: "/leaves" },
        { label: "Next Shift", value: stats.nextShift ? format(new Date(stats.nextShift.date), "MMM d") : "None", icon: CalendarCheck, color: "text-emerald-600 bg-emerald-50", href: "/schedule" },
      ];
    }
    return [];
  };

  const cards = getCards();
  const weeklyData = stats && "weeklyDistribution" in stats ? stats.weeklyDistribution : [];
  const maxShifts = Math.max(1, ...weeklyData.map((d) => d.shifts));
  const activityData = stats && "recentActivity" in stats ? (stats as AdminStats | ManagerStats).recentActivity : [];

  const greetingTitle = () => {
    if (role === "ADMIN") return "Admin Dashboard";
    if (role === "MANAGER") {
      const name = stats?.type === "department" ? (stats as ManagerStats).departmentName : "";
      return name ? `${name} — Manager` : "Manager Dashboard";
    }
    return "My Dashboard";
  };

  const greetingSubtitle = () => {
    if (role === "ADMIN") return "System-wide overview";
    if (role === "MANAGER") return "Your department at a glance";
    return "Your personal schedule overview";
  };

  const activityIcon = (type: string) => {
    if (type === "registration") return ClipboardList;
    if (type === "swap") return ArrowLeftRight;
    return CalendarOff;
  };

  const activityColor = (status: string) => {
    if (status.includes("APPROVED")) return "text-green-500 bg-green-50";
    if (status.includes("REJECTED") || status.includes("DECLINED")) return "text-red-400 bg-red-50";
    return "text-amber-500 bg-amber-50";
  };

  const fmtActivityStatus = (status: string) => {
    return status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            {greetingTitle()}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">{greetingSubtitle()}</p>
        </div>

        {/* Stat Cards */}
        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${cards.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          {loading
            ? Array.from({ length: role === "ADMIN" ? 4 : 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="inline-block h-3 w-20 animate-pulse rounded bg-gray-100" />
                  <span className="inline-block h-7 w-7 animate-pulse rounded-lg bg-gray-100" />
                </div>
                <span className="mt-3 inline-block h-8 w-12 animate-pulse rounded bg-gray-100" />
              </div>
            ))
            : cards.map((s) => (
              <button
                key={s.label}
                onClick={() => router.push(s.href)}
                className="group rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-all duration-200 hover:border-indigo-200 hover:shadow-md active:scale-[0.98]"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-500">{s.label}</p>
                  <div className={`rounded-lg p-1.5 transition-transform duration-200 group-hover:scale-110 ${s.color}`}>
                    <s.icon className="h-3.5 w-3.5" />
                  </div>
                </div>
                <p className="mt-3 text-2xl font-semibold text-gray-900">{s.value}</p>
                <div className="mt-1.5 flex items-center gap-1 text-[11px] text-gray-400 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <ArrowUpRight className="h-3 w-3" />
                  View details
                </div>
              </button>
            ))}
        </div>

        {/* Charts Row */}
        {!loading && stats && (
          <div className={`grid gap-5 ${activityData.length > 0 ? "grid-cols-1 lg:grid-cols-5" : "grid-cols-1"}`}>
            {/* Weekly Shift Distribution - Bar Chart */}
            <div className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${activityData.length > 0 ? "lg:col-span-3" : ""}`}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">This Week</h3>
                  <p className="text-xs text-gray-400">Shift distribution by day</p>
                </div>
                <div className="rounded-lg bg-indigo-50 p-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-indigo-600" />
                </div>
              </div>

              <div className="flex items-end gap-2" style={{ height: "160px" }}>
                {weeklyData.map((d) => {
                  const heightPct = maxShifts > 0 ? (d.shifts / maxShifts) * 100 : 0;
                  const isWeekend = d.day === "Sat" || d.day === "Sun";
                  return (
                    <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-gray-500">
                        {d.shifts > 0 ? d.shifts : ""}
                      </span>
                      <div className="relative w-full" style={{ height: "120px" }}>
                        <div
                          className={`absolute bottom-0 w-full rounded-t-md transition-all duration-500 ${d.shifts === 0
                              ? "bg-gray-100"
                              : isWeekend
                                ? "bg-amber-200"
                                : "bg-indigo-400"
                            }`}
                          style={{
                            height: d.shifts === 0 ? "4px" : `${Math.max(8, heightPct)}%`,
                          }}
                        />
                      </div>
                      <span className={`text-[10px] font-medium ${isWeekend ? "text-gray-300" : "text-gray-500"}`}>
                        {d.day}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Chart legend */}
              <div className="mt-3 flex items-center gap-4 border-t border-gray-100 pt-3 text-[10px] text-gray-400">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-indigo-400" />
                  Weekday
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-amber-200" />
                  Weekend
                </div>
              </div>
            </div>

            {/* Recent Activity Feed */}
            {activityData.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Recent Activity</h3>
                    <p className="text-xs text-gray-400">Latest updates</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-1.5">
                    <Clock className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                </div>

                <div className="space-y-2.5">
                  {activityData.map((item) => {
                    const Icon = activityIcon(item.type);
                    const colorCls = activityColor(item.status);
                    return (
                      <div key={item.id} className="flex items-start gap-2.5">
                        <div className={`mt-0.5 rounded-md p-1 ${colorCls}`}>
                          <Icon className="h-3 w-3" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-gray-700">
                            {item.user}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {item.type} · {fmtActivityStatus(item.status)}
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] text-gray-300">
                          {format(new Date(item.time), "HH:mm")}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {activityData.length === 0 && (
                  <p className="py-4 text-center text-xs text-gray-400">No recent activity</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Quick Actions */}
        {!loading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Schedule", href: "/schedule", icon: CalendarDays, desc: "View shifts" },
              { label: "Leave", href: "/leaves", icon: CalendarOff, desc: "Request time off" },
              { label: "Registrations", href: "/registrations", icon: ClipboardList, desc: "Shift preferences" },
              { label: "Swaps", href: "/swaps", icon: ArrowLeftRight, desc: "Shift exchanges" },
            ].map((q) => (
              <button
                key={q.label}
                onClick={() => router.push(q.href)}
                className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3.5 text-left transition-all duration-200 hover:border-indigo-200 hover:shadow-sm active:scale-[0.98]"
              >
                <div className="rounded-lg bg-gray-50 p-2 transition-colors group-hover:bg-indigo-50">
                  <q.icon className="h-4 w-4 text-gray-400 transition-colors group-hover:text-indigo-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-700">{q.label}</p>
                  <p className="text-[10px] text-gray-400">{q.desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
