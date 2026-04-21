"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MessageSquare,
  Search,
  Filter,
  ChevronDown,
  Bot,
  User,
  GraduationCap,
  ArrowDownUp,
  RefreshCw,
} from "lucide-react";
import {
  collection,
  query,
  orderBy,
  getDocs,
  where,
  limit,
  startAfter,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";

/* ─── Types ─── */

interface BotLogEntry {
  id: string;
  phone: string;
  message: string;
  action: string;
  family_number: string | null;
  timestamp: string;
}

interface AdmissionEnquiry {
  id: string;
  ref_number: string;
  phone: string;
  parent_name: string;
  email: string;
  students: { name: string; gender: string; desired_grade: string }[];
  student_count: number;
  status: string;
  email_sent: boolean;
  created_at: string;
  updated_at: string;
}

/* ─── Constants ─── */

const PAGE_SIZE = 50;

const ACTION_STYLES: Record<string, string> = {
  menu: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  eduflag: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  books: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  fees: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  unregistered: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  admission_submit: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const ACTION_LABELS: Record<string, string> = {
  menu: "Menu",
  eduflag: "Eduflag",
  books: "Books",
  fees: "Fees",
  unregistered: "Unregistered",
  admission_submit: "Admission",
};

const STATUS_STYLES: Record<string, string> = {
  new: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  contacted: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  enrolled: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

/* ─── Helpers ─── */

function formatPhone(phone: string): string {
  if (phone.length === 12 && phone.startsWith("966")) {
    return `+${phone.slice(0, 3)} ${phone.slice(3, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`;
  }
  return phone;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) + " " + d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatTimestamp(iso);
}

/* ─── Page ─── */

export default function WhatsAppLogsPage() {
  const [tab, setTab] = useState<"bot" | "admission">("bot");
  const [logs, setLogs] = useState<BotLogEntry[]>([]);
  const [enquiries, setEnquiries] = useState<AdmissionEnquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortDesc, setSortDesc] = useState(true);

  /* ── Stats ── */
  const [stats, setStats] = useState({ total: 0, registered: 0, unregistered: 0, admissions: 0 });

  /* ── Fetch bot logs ── */
  const fetchLogs = useCallback(async (append = false) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const db = getDb();
      const col = collection(db, "whatsapp_bot_log");
      const constraints: Parameters<typeof query>[1][] = [
        orderBy("timestamp", sortDesc ? "desc" : "asc"),
        limit(PAGE_SIZE),
      ];
      if (actionFilter) constraints.splice(0, 0, where("action", "==", actionFilter));
      if (append && lastDoc) constraints.push(startAfter(lastDoc));

      const snap = await getDocs(query(col, ...constraints));
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as BotLogEntry));

      setLogs((prev) => (append ? [...prev, ...rows] : rows));
      setHasMore(snap.docs.length === PAGE_SIZE);
      setLastDoc(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null);
    } catch (err) {
      console.error("Failed to fetch bot logs:", err);
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
    }
  }, [actionFilter, sortDesc, lastDoc]);

  /* ── Fetch admission enquiries ── */
  const fetchEnquiries = useCallback(async () => {
    setLoading(true);
    try {
      const db = getDb();
      const col = collection(db, "admission_enquiries");
      const constraints: Parameters<typeof query>[1][] = [
        orderBy("created_at", "desc"),
        limit(100),
      ];
      if (statusFilter) constraints.splice(0, 0, where("status", "==", statusFilter));

      const snap = await getDocs(query(col, ...constraints));
      setEnquiries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AdmissionEnquiry)));
    } catch (err) {
      console.error("Failed to fetch admission enquiries:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  /* ── Fetch stats ── */
  const fetchStats = useCallback(async () => {
    try {
      const db = getDb();
      const [allSnap, unregSnap, admSnap] = await Promise.all([
        getDocs(query(collection(db, "whatsapp_bot_log"), limit(1000))),
        getDocs(query(collection(db, "whatsapp_bot_log"), where("action", "==", "unregistered"), limit(1000))),
        getDocs(query(collection(db, "admission_enquiries"), limit(1000))),
      ]);
      setStats({
        total: allSnap.size,
        registered: allSnap.size - unregSnap.size,
        unregistered: unregSnap.size,
        admissions: admSnap.size,
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (tab === "bot") fetchLogs();
    else fetchEnquiries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, actionFilter, statusFilter, sortDesc]);

  /* ── Filter locally by search ── */
  const filteredLogs = searchTerm
    ? logs.filter(
        (l) =>
          l.phone.includes(searchTerm) ||
          l.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (l.family_number || "").includes(searchTerm)
      )
    : logs;

  const filteredEnquiries = searchTerm
    ? enquiries.filter(
        (e) =>
          e.phone.includes(searchTerm) ||
          e.parent_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          e.ref_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
          e.email.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : enquiries;

  /* ─── Loading state ─── */
  if (loading && logs.length === 0 && enquiries.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-10 w-full" />
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-6 w-6 text-green-600" />
            WhatsApp Bot Logs
          </h1>
          <p className="text-muted-foreground mt-1">
            View incoming conversations and admission enquiries
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (tab === "bot") fetchLogs();
            else fetchEnquiries();
            fetchStats();
          }}
        >
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <MessageSquare className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Messages</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <User className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Registered</p>
                <p className="text-2xl font-bold">{stats.registered}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <User className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unregistered</p>
                <p className="text-2xl font-bold">{stats.unregistered}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <GraduationCap className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Admissions</p>
                <p className="text-2xl font-bold">{stats.admissions}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Tab Switcher ── */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab("bot")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "bot"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Bot className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Bot Conversations
        </button>
        <button
          onClick={() => setTab("admission")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "admission"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <GraduationCap className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Admission Enquiries
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={tab === "bot" ? "Search by phone, message, family#..." : "Search by name, phone, email, ref#..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {tab === "bot" ? (
          <>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <select
                value={actionFilter}
                onChange={(e) => { setActionFilter(e.target.value); setLastDoc(null); }}
                className="pl-10 pr-8 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer"
              >
                <option value="">All Actions</option>
                <option value="menu">Menu</option>
                <option value="eduflag">Eduflag</option>
                <option value="books">Books</option>
                <option value="fees">Fees</option>
                <option value="unregistered">Unregistered</option>
                <option value="admission_submit">Admission</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-[38px]"
              onClick={() => { setSortDesc(!sortDesc); setLastDoc(null); }}
            >
              <ArrowDownUp className="h-4 w-4 mr-1" />
              {sortDesc ? "Newest First" : "Oldest First"}
            </Button>
          </>
        ) : (
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-10 pr-8 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="enrolled">Enrolled</option>
              <option value="rejected">Rejected</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
        )}
      </div>

      {/* ── Bot Conversations Tab ── */}
      {tab === "bot" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {filteredLogs.length} conversation{filteredLogs.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Time</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Family #</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No conversations found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="pl-6">
                        <div className="text-sm">{timeAgo(log.timestamp)}</div>
                        <div className="text-xs text-muted-foreground">{formatTimestamp(log.timestamp)}</div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{formatPhone(log.phone)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm max-w-[300px] truncate block">{log.message}</span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_STYLES[log.action] || ACTION_STYLES.menu}`}>
                          {ACTION_LABELS[log.action] || log.action}
                        </span>
                      </TableCell>
                      <TableCell>
                        {log.family_number ? (
                          <span className="font-mono text-sm">{log.family_number}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {hasMore && filteredLogs.length > 0 && (
              <div className="flex justify-center p-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => fetchLogs(true)}
                >
                  {loadingMore ? (
                    <>Loading...</>
                  ) : (
                    <><ChevronDown className="h-4 w-4 mr-1" /> Load More</>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Admission Enquiries Tab ── */}
      {tab === "admission" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {filteredEnquiries.length} enquir{filteredEnquiries.length !== 1 ? "ies" : "y"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Ref #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Email Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEnquiries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      <GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No admission enquiries found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEnquiries.map((enq) => (
                    <TableRow key={enq.id}>
                      <TableCell className="pl-6">
                        <span className="font-mono text-sm font-medium">{enq.ref_number}</span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{timeAgo(enq.created_at)}</div>
                        <div className="text-xs text-muted-foreground">{formatTimestamp(enq.created_at)}</div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-sm">{enq.parent_name}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{enq.email}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{formatPhone(enq.phone)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          {enq.students.map((s, i) => (
                            <div key={i} className="text-xs">
                              <span className="font-medium">{s.name}</span>
                              <span className="text-muted-foreground ml-1">
                                ({s.gender === "Male" ? "M" : "F"}) — {s.desired_grade}
                              </span>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[enq.status] || STATUS_STYLES.new}`}>
                          {enq.status.charAt(0).toUpperCase() + enq.status.slice(1)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {enq.email_sent ? (
                          <span className="text-green-600 text-sm">✓ Sent</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
