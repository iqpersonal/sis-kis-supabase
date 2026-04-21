"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ClipboardCheck, Users, UserPlus, CheckCircle, XCircle, Clock,
  TrendingUp, ArrowRight, Phone, Mail,
} from "lucide-react";
import Link from "next/link";
import { getDb } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

/* ── Status config ── */
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  contacted: { label: "Contacted", color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300" },
  test_scheduled: { label: "Test Scheduled", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  test_done: { label: "Test Done", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
  interview_scheduled: { label: "Interview Scheduled", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300" },
  interview_done: { label: "Interview Done", color: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300" },
  offer_sent: { label: "Offer Sent", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  accepted: { label: "Accepted", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  enrolled: { label: "Enrolled", color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  withdrawn: { label: "Withdrawn", color: "bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300" },
};

interface Enquiry {
  ref_number: string;
  parent_name: string;
  phone: string;
  email: string;
  student_count: number;
  students: { name: string; gender: string; desired_grade: string }[];
  status: string;
  created_at: string;
  source?: string;
}

interface Stats {
  total: number;
  new: number;
  inProgress: number;
  accepted: number;
  enrolled: number;
  rejected: number;
  thisMonth: number;
}

export default function AdmissionsDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const db = getDb();
        const snap = await getDocs(collection(db, "admission_enquiries"));
        const all: Enquiry[] = [];
        snap.forEach((d) => all.push(d.data() as Enquiry));

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const inProgressStatuses = ["contacted", "test_scheduled", "test_done", "interview_scheduled", "interview_done", "offer_sent"];

        setStats({
          total: all.length,
          new: all.filter((e) => e.status === "new").length,
          inProgress: all.filter((e) => inProgressStatuses.includes(e.status)).length,
          accepted: all.filter((e) => e.status === "accepted").length,
          enrolled: all.filter((e) => e.status === "enrolled").length,
          rejected: all.filter((e) => e.status === "rejected").length,
          thisMonth: all.filter((e) => e.created_at >= monthStart).length,
        });

        const sorted = [...all].sort((a, b) => b.created_at.localeCompare(a.created_at));
        setRecent(sorted.slice(0, 10));
      } catch (err) {
        console.error("Failed to load admissions:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const statCards = [
    { label: "Total Enquiries", value: stats?.total ?? 0, icon: ClipboardCheck, color: "text-blue-600" },
    { label: "New", value: stats?.new ?? 0, icon: UserPlus, color: "text-cyan-600" },
    { label: "In Progress", value: stats?.inProgress ?? 0, icon: Clock, color: "text-amber-600" },
    { label: "Accepted", value: stats?.accepted ?? 0, icon: CheckCircle, color: "text-emerald-600" },
    { label: "Enrolled", value: stats?.enrolled ?? 0, icon: Users, color: "text-green-600" },
    { label: "This Month", value: stats?.thisMonth ?? 0, icon: TrendingUp, color: "text-purple-600" },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admissions Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of admission enquiries and pipeline</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/admissions/enquiries">
            <Button variant="outline" size="sm">View All Enquiries</Button>
          </Link>
          <Link href="/dashboard/admissions/pipeline">
            <Button size="sm">Pipeline View</Button>
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold">{s.value}</p>
                </div>
                <s.icon className={`h-8 w-8 ${s.color} opacity-80`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Conversion funnel mini */}
      {stats && stats.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Conversion Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { label: "Enquiries", value: stats.total, color: "bg-blue-500" },
                { label: "In Progress", value: stats.inProgress, color: "bg-amber-500" },
                { label: "Accepted", value: stats.accepted, color: "bg-emerald-500" },
                { label: "Enrolled", value: stats.enrolled, color: "bg-green-500" },
              ].map((step, i, arr) => (
                <div key={step.label} className="flex items-center gap-2">
                  <div className="text-center">
                    <div className={`${step.color} text-white rounded-lg px-4 py-2 font-bold text-lg min-w-[80px]`}>
                      {step.value}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{step.label}</p>
                  </div>
                  {i < arr.length - 1 && (
                    <div className="flex flex-col items-center">
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">
                        {step.value > 0 ? `${Math.round((arr[i + 1].value / step.value) * 100)}%` : "0%"}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent enquiries */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Enquiries</CardTitle>
          <Link href="/dashboard/admissions/enquiries">
            <Button variant="ghost" size="sm">View All <ArrowRight className="ml-1 h-4 w-4" /></Button>
          </Link>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No enquiries yet</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ref #</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Students</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((e) => {
                    const st = STATUS_LABELS[e.status] || { label: e.status, color: "bg-gray-100 text-gray-800" };
                    return (
                      <TableRow key={e.ref_number}>
                        <TableCell className="font-mono text-xs font-medium">{e.ref_number}</TableCell>
                        <TableCell className="font-medium">{e.parent_name}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5 text-xs">
                            <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{e.phone}</span>
                            <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{e.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">
                            {e.students?.map((s, i) => (
                              <div key={i}>{s.name} — {s.desired_grade}</div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`text-xs ${st.color}`}>{st.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(e.created_at).toLocaleDateString("en-GB")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">{e.source || "whatsapp"}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
