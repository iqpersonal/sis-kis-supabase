"use client";

import { useStaffAuth } from "@/context/staff-auth-context";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase,
  Building2,
  MapPin,
  IdCard,
  Megaphone,
  Wrench,
  Monitor,
  ShoppingCart,
} from "lucide-react";
import Link from "next/link";

const QUICK_LINKS = [
  {
    href: "/staff/dashboard/announcements",
    label: "Announcements",
    icon: Megaphone,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    href: "/staff/dashboard/tickets",
    label: "IT Tickets",
    icon: Wrench,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
  },
  {
    href: "/staff/dashboard/assets",
    label: "My Assets",
    icon: Monitor,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
  {
    href: "/staff/dashboard/store",
    label: "Store Requests",
    icon: ShoppingCart,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
];

export default function StaffHomePage() {
  const { staff } = useStaffAuth();

  if (!staff) return null;

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome, {staff.firstName || staff.fullNameEn}
        </h1>
        <p className="text-muted-foreground">
          Staff Portal — manage your profile, requests, and more
        </p>
      </div>

      {/* Profile Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Briefcase className="h-5 w-5 text-emerald-500" />
            My Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Full Name (EN)</p>
              <p className="font-medium">{staff.fullNameEn || "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Full Name (AR)</p>
              <p className="font-medium" dir="rtl">
                {staff.fullNameAr || "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium text-sm">{staff.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Department</p>
                <p className="font-medium">{staff.department || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Position</p>
                <p className="font-medium">{staff.position || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">School / Branch</p>
                <p className="font-medium">
                  {[staff.school, staff.branch].filter(Boolean).join(" / ") || "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <IdCard className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Staff Number</p>
                <p className="font-medium">{staff.staffNumber}</p>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant={staff.isActive ? "default" : "secondary"}>
                {staff.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Quick Access</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_LINKS.map(({ href, label, icon: Icon, color, bg }) => (
            <Link key={href} href={href}>
              <Card className="transition-shadow hover:shadow-md cursor-pointer">
                <CardContent className="flex items-center gap-3 p-4">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg}`}
                  >
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <span className="font-medium text-sm">{label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
