"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Search, Plus, Phone, Mail, Download, MessageSquare, CalendarDays, Clock, MapPin, User, Loader2, CheckCircle2, XCircle,
} from "lucide-react";
import { getDb, getFirebaseAuth } from "@/lib/firebase";
import {
  collection, getDocs, doc, updateDoc, setDoc, addDoc,
} from "firebase/firestore";

/* ── Status flow ── */
const STATUSES = [
  "new", "contacted", "test_scheduled", "test_done",
  "interview_scheduled", "interview_done", "offer_sent",
  "accepted", "enrolled", "rejected", "withdrawn",
] as const;

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

const GRADE_OPTIONS = [
  "KG1", "KG2", "KG3", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5",
  "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12",
];

const PLACE_OPTIONS = [
  "Boys' School",
  "Girls' School",
  "Admin Department",
  "Kindergarten Building",
];

interface Student { name: string; gender: string; desired_grade: string }

interface Enquiry {
  ref_number: string;
  parent_name: string;
  phone: string;
  email: string;
  student_count: number;
  students: Student[];
  status: string;
  notes?: string;
  source?: string;
  created_at: string;
  updated_at: string;
}

export default function AllEnquiriesPage() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [filtered, setFiltered] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [detailEnquiry, setDetailEnquiry] = useState<Enquiry | null>(null);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);

  // Scheduling dialog state
  const [schedDialog, setSchedDialog] = useState(false);
  const [schedType, setSchedType] = useState<"test" | "interview">("test");
  const [schedEnquiry, setSchedEnquiry] = useState<Enquiry | null>(null);
  const [schedForm, setSchedForm] = useState({
    student_idx: 0,
    date: "",
    time: "",
    place: PLACE_OPTIONS[0],
    staff: "",
  });
  const [schedSaving, setSchedSaving] = useState(false);
  const [schedResult, setSchedResult] = useState<{ ok: boolean; email?: boolean; whatsapp?: boolean } | null>(null);

  // Quick-notify dialog state (for contacted / offer_sent)
  const [notifyDialog, setNotifyDialog] = useState(false);
  const [notifyType, setNotifyType] = useState<"contacted" | "offer_sent">("contacted");
  const [notifyEnquiry, setNotifyEnquiry] = useState<Enquiry | null>(null);
  const [notifySaving, setNotifySaving] = useState(false);
  const [notifyResult, setNotifyResult] = useState<{ ok: boolean; email?: boolean; whatsapp?: boolean } | null>(null);

  // Manual enquiry form
  const [form, setForm] = useState({
    parent_name: "", phone: "", email: "",
    students: [{ name: "", gender: "Male", desired_grade: "KG1" }] as Student[],
  });

  const fetchEnquiries = useCallback(async () => {
    try {
      const db = getDb();
      const snap = await getDocs(collection(db, "admission_enquiries"));
      const all: Enquiry[] = [];
      snap.forEach((d) => all.push(d.data() as Enquiry));
      all.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setEnquiries(all);
    } catch (err) {
      console.error("Failed to load enquiries:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEnquiries(); }, [fetchEnquiries]);

  // Apply filters
  useEffect(() => {
    let list = [...enquiries];
    if (statusFilter !== "all") list = list.filter((e) => e.status === statusFilter);
    if (sourceFilter !== "all") list = list.filter((e) => (e.source || "whatsapp") === sourceFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        e.ref_number.toLowerCase().includes(q) ||
        e.parent_name.toLowerCase().includes(q) ||
        e.phone.includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.students?.some((s) => s.name.toLowerCase().includes(q))
      );
    }
    setFiltered(list);
  }, [enquiries, search, statusFilter, sourceFilter]);

  /* ── Status update ── */
  async function updateStatus(ref: string, newStatus: string) {
    // If scheduling is required, open the dialog instead of updating directly
    if (newStatus === "test_scheduled" || newStatus === "interview_scheduled") {
      const enquiry = enquiries.find((e) => e.ref_number === ref);
      if (!enquiry) return;
      setSchedEnquiry(enquiry);
      setSchedType(newStatus === "test_scheduled" ? "test" : "interview");
      setSchedForm({ student_idx: 0, date: "", time: "", place: PLACE_OPTIONS[0], staff: "" });
      setSchedResult(null);
      setSchedDialog(true);
      return;
    }

    // Contacted or Offer Sent → open quick-notify dialog
    if (newStatus === "contacted" || newStatus === "offer_sent") {
      const enquiry = enquiries.find((e) => e.ref_number === ref);
      if (!enquiry) return;
      setNotifyEnquiry(enquiry);
      setNotifyType(newStatus as "contacted" | "offer_sent");
      setNotifyResult(null);
      setNotifyDialog(true);
      return;
    }

    try {
      const db = getDb();
      await updateDoc(doc(db, "admission_enquiries", ref), {
        status: newStatus,
        updated_at: new Date().toISOString(),
      });
      setEnquiries((prev) =>
        prev.map((e) => e.ref_number === ref ? { ...e, status: newStatus, updated_at: new Date().toISOString() } : e)
      );
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  }

  /* ── Confirm scheduling (test or interview) ── */
  async function confirmSchedule() {
    if (!schedEnquiry || !schedForm.date || !schedForm.time || !schedForm.place) return;
    setSchedSaving(true);
    setSchedResult(null);

    const selectedStudent = schedEnquiry.students?.[schedForm.student_idx];
    const studentName = selectedStudent?.name || "";
    const studentGrade = selectedStudent?.desired_grade || "";
    const newStatus = schedType === "test" ? "test_scheduled" : "interview_scheduled";
    const now = new Date().toISOString();

    try {
      const db = getDb();

      // 1. Update enquiry status
      await updateDoc(doc(db, "admission_enquiries", schedEnquiry.ref_number), {
        status: newStatus,
        updated_at: now,
      });
      setEnquiries((prev) =>
        prev.map((e) =>
          e.ref_number === schedEnquiry.ref_number
            ? { ...e, status: newStatus, updated_at: now }
            : e
        )
      );

      // 2. Create record in admission_tests or admission_interviews
      if (schedType === "test") {
        const testId = `${schedEnquiry.ref_number}_${studentName.replace(/\s+/g, "_")}_${Date.now()}`;
        await setDoc(doc(db, "admission_tests", testId), {
          enquiry_ref: schedEnquiry.ref_number,
          parent_name: schedEnquiry.parent_name,
          student_name: studentName,
          desired_grade: studentGrade,
          test_date: schedForm.date,
          time: schedForm.time,
          place: schedForm.place,
          staff: schedForm.staff,
          math_score: null,
          english_score: null,
          arabic_score: null,
          result: "pending",
          notes: "",
          created_at: now,
          updated_at: now,
        });
      } else {
        await addDoc(collection(db, "admission_interviews"), {
          ref_number: schedEnquiry.ref_number,
          parent_name: schedEnquiry.parent_name,
          student_name: studentName,
          student_grade: studentGrade,
          date: schedForm.date,
          time: schedForm.time,
          place: schedForm.place,
          staff: schedForm.staff,
          status: "scheduled",
          created_at: now,
        });
      }

      // 3. Send email + WhatsApp via API
      let notifyResult = { ok: true, email: { sent: false }, whatsapp: { sent: false } };
      try {
        const user = getFirebaseAuth().currentUser;
        const token = user ? await user.getIdToken() : null;
        if (token) {
          const res = await fetch("/api/admissions/notify", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              type: schedType,
              parent_name: schedEnquiry.parent_name,
              phone: schedEnquiry.phone,
              email: schedEnquiry.email,
              ref_number: schedEnquiry.ref_number,
              student_name: studentName,
              student_grade: studentGrade,
              date: schedForm.date,
              time: schedForm.time,
              place: schedForm.place,
              staff: schedForm.staff,
              source: schedEnquiry.source || "whatsapp",
            }),
          });
          notifyResult = await res.json();
        }
      } catch (notifyErr) {
        console.error("Notification send error:", notifyErr);
      }

      setSchedResult({
        ok: true,
        email: notifyResult?.email?.sent ?? false,
        whatsapp: notifyResult?.whatsapp?.sent ?? false,
      });
    } catch (err) {
      console.error("Failed to schedule:", err);
      setSchedResult({ ok: false });
    } finally {
      setSchedSaving(false);
    }
  }

  /* ── Confirm quick-notify (contacted / offer_sent) ── */
  async function confirmNotify() {
    if (!notifyEnquiry) return;
    setNotifySaving(true);
    setNotifyResult(null);
    const now = new Date().toISOString();
    const newStatus = notifyType === "contacted" ? "contacted" : "offer_sent";

    try {
      const db = getDb();

      // 1. Update enquiry status
      await updateDoc(doc(db, "admission_enquiries", notifyEnquiry.ref_number), {
        status: newStatus,
        updated_at: now,
      });
      setEnquiries((prev) =>
        prev.map((e) =>
          e.ref_number === notifyEnquiry.ref_number
            ? { ...e, status: newStatus, updated_at: now }
            : e
        )
      );

      // 2. Send notification via API
      let result = { ok: true, email: { sent: false }, whatsapp: { sent: false } };
      try {
        const user = getFirebaseAuth().currentUser;
        const token = user ? await user.getIdToken() : null;
        if (token) {
          const res = await fetch("/api/admissions/notify", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              type: notifyType,
              parent_name: notifyEnquiry.parent_name,
              phone: notifyEnquiry.phone,
              email: notifyEnquiry.email,
              ref_number: notifyEnquiry.ref_number,
              source: notifyEnquiry.source || "whatsapp",
            }),
          });
          result = await res.json();
        }
      } catch (notifyErr) {
        console.error("Notification send error:", notifyErr);
      }

      setNotifyResult({
        ok: true,
        email: result?.email?.sent ?? false,
        whatsapp: result?.whatsapp?.sent ?? false,
      });
    } catch (err) {
      console.error("Failed to notify:", err);
      setNotifyResult({ ok: false });
    } finally {
      setNotifySaving(false);
    }
  }

  /* ── Save notes ── */
  async function saveNotes(ref: string) {
    setSaving(true);
    try {
      const db = getDb();
      await updateDoc(doc(db, "admission_enquiries", ref), {
        notes: noteText,
        updated_at: new Date().toISOString(),
      });
      setEnquiries((prev) =>
        prev.map((e) => e.ref_number === ref ? { ...e, notes: noteText } : e)
      );
      if (detailEnquiry) setDetailEnquiry({ ...detailEnquiry, notes: noteText });
    } catch (err) {
      console.error("Failed to save notes:", err);
    } finally {
      setSaving(false);
    }
  }

  /* ── Add manual enquiry ── */
  async function addManualEnquiry() {
    if (!form.parent_name || !form.email || !form.phone) return;
    setSaving(true);
    try {
      const db = getDb();
      // Generate ref number
      const snap = await getDocs(collection(db, "admission_enquiries"));
      let maxNum = 1000;
      snap.forEach((d) => {
        const ref = d.data().ref_number as string;
        const num = parseInt(ref.replace("ADM-", ""), 10);
        if (num > maxNum) maxNum = num;
      });
      const refNumber = `ADM-${maxNum + 1}`;
      const now = new Date().toISOString();

      const newEnquiry: Enquiry = {
        ref_number: refNumber,
        parent_name: form.parent_name,
        phone: form.phone,
        email: form.email,
        students: form.students.filter((s) => s.name.trim()),
        student_count: form.students.filter((s) => s.name.trim()).length,
        status: "new",
        source: "manual",
        created_at: now,
        updated_at: now,
      };

      await setDoc(doc(db, "admission_enquiries", refNumber), newEnquiry);
      setEnquiries((prev) => [newEnquiry, ...prev]);
      setShowAddDialog(false);
      setForm({
        parent_name: "", phone: "", email: "",
        students: [{ name: "", gender: "Male", desired_grade: "KG1" }],
      });
    } catch (err) {
      console.error("Failed to add enquiry:", err);
    } finally {
      setSaving(false);
    }
  }

  /* ── Export CSV ── */
  function exportCSV() {
    const headers = ["Ref#", "Parent Name", "Phone", "Email", "Students", "Grades", "Status", "Source", "Date", "Notes"];
    const rows = filtered.map((e) => [
      e.ref_number,
      e.parent_name,
      e.phone,
      e.email,
      e.students?.map((s) => s.name).join("; "),
      e.students?.map((s) => s.desired_grade).join("; "),
      e.status,
      e.source || "whatsapp",
      new Date(e.created_at).toLocaleDateString("en-GB"),
      (e.notes || "").replace(/\n/g, " "),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `admission_enquiries_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-[500px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">All Enquiries</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} of {enquiries.length} enquiries</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Add Enquiry</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add Manual Enquiry</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Parent Name *</Label>
                  <Input value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Phone *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  <div><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                </div>
                <div>
                  <Label>Students</Label>
                  {form.students.map((s, i) => (
                    <div key={i} className="grid grid-cols-3 gap-2 mt-2">
                      <Input placeholder="Student name" value={s.name}
                        onChange={(e) => {
                          const updated = [...form.students];
                          updated[i] = { ...s, name: e.target.value };
                          setForm({ ...form, students: updated });
                        }}
                      />
                      <Select value={s.gender} onValueChange={(v) => {
                        const updated = [...form.students];
                        updated[i] = { ...s, gender: v };
                        setForm({ ...form, students: updated });
                      }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={s.desired_grade} onValueChange={(v) => {
                        const updated = [...form.students];
                        updated[i] = { ...s, desired_grade: v };
                        setForm({ ...form, students: updated });
                      }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {GRADE_OPTIONS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  {form.students.length < 5 && (
                    <Button variant="ghost" size="sm" className="mt-2" onClick={() =>
                      setForm({ ...form, students: [...form.students, { name: "", gender: "Male", desired_grade: "KG1" }] })
                    }><Plus className="mr-1 h-3 w-3" /> Add Student</Button>
                  )}
                </div>
                <Button onClick={addManualEnquiry} disabled={saving} className="w-full">
                  {saving ? "Saving..." : "Create Enquiry"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, ref#, phone, email..." className="pl-9"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Sources" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Ref #</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No enquiries found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((e) => {
                    const st = STATUS_LABELS[e.status] || { label: e.status, color: "" };
                    return (
                      <TableRow key={e.ref_number} className="cursor-pointer hover:bg-muted/50"
                        onClick={() => { setDetailEnquiry(e); setNoteText(e.notes || ""); }}
                      >
                        <TableCell className="font-mono text-xs font-medium">{e.ref_number}</TableCell>
                        <TableCell className="font-medium">{e.parent_name}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5 text-xs">
                            <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{e.phone}</span>
                            <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{e.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs space-y-0.5">
                            {e.students?.map((s, i) => (
                              <div key={i}>{s.name} — {s.desired_grade}</div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell onClick={(ev) => ev.stopPropagation()}>
                          <Select value={e.status} onValueChange={(v) => updateStatus(e.ref_number, v)}>
                            <SelectTrigger className="h-7 text-xs w-[150px]">
                              <Badge variant="secondary" className={`text-xs ${st.color}`}>{st.label}</Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>{STATUS_LABELS[s].label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">{e.source || "whatsapp"}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(e.created_at).toLocaleDateString("en-GB")}
                        </TableCell>
                        <TableCell onClick={(ev) => ev.stopPropagation()}>
                          {e.notes && <MessageSquare className="h-4 w-4 text-amber-500" />}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail / Notes dialog */}
      <Dialog open={!!detailEnquiry} onOpenChange={(open) => { if (!open) setDetailEnquiry(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Enquiry {detailEnquiry?.ref_number}</DialogTitle></DialogHeader>
          {detailEnquiry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Parent:</span> <strong>{detailEnquiry.parent_name}</strong></div>
                <div><span className="text-muted-foreground">Phone:</span> {detailEnquiry.phone}</div>
                <div><span className="text-muted-foreground">Email:</span> {detailEnquiry.email}</div>
                <div><span className="text-muted-foreground">Source:</span> {detailEnquiry.source || "whatsapp"}</div>
                <div><span className="text-muted-foreground">Created:</span> {new Date(detailEnquiry.created_at).toLocaleString("en-GB")}</div>
                <div>
                  <span className="text-muted-foreground">Status: </span>
                  <Badge variant="secondary" className={`text-xs ${STATUS_LABELS[detailEnquiry.status]?.color}`}>
                    {STATUS_LABELS[detailEnquiry.status]?.label || detailEnquiry.status}
                  </Badge>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">Students</Label>
                <div className="mt-1 space-y-1">
                  {detailEnquiry.students?.map((s, i) => (
                    <div key={i} className="text-sm bg-muted/50 rounded px-3 py-1.5">
                      {s.name} — {s.gender} — {s.desired_grade}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">Notes / Comments</Label>
                <Textarea
                  className="mt-1"
                  rows={4}
                  placeholder="Add notes about this enquiry..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
                <Button size="sm" className="mt-2" onClick={() => saveNotes(detailEnquiry.ref_number)} disabled={saving}>
                  {saving ? "Saving..." : "Save Notes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Scheduling Dialog (Test / Interview) */}
      <Dialog open={schedDialog} onOpenChange={(open) => { if (!open && !schedSaving) { setSchedDialog(false); setSchedResult(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Schedule {schedType === "test" ? "Entrance Test" : "Admission Interview"}
            </DialogTitle>
          </DialogHeader>

          {schedResult ? (
            /* ── Result view ── */
            <div className="space-y-4 py-4">
              <div className={`flex flex-col items-center gap-2 text-center ${schedResult.ok ? "text-green-600" : "text-red-600"}`}>
                {schedResult.ok ? (
                  <CheckCircle2 className="h-12 w-12" />
                ) : (
                  <XCircle className="h-12 w-12" />
                )}
                <p className="font-semibold text-lg">
                  {schedResult.ok ? "Scheduled Successfully!" : "Scheduling Failed"}
                </p>
              </div>
              {schedResult.ok && (
                <div className="space-y-2 text-sm bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>Email: {schedResult.email ? <span className="text-green-600 font-medium">Sent</span> : <span className="text-amber-600 font-medium">Not sent</span>}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span>WhatsApp: {schedResult.whatsapp ? <span className="text-green-600 font-medium">Sent</span> : <span className="text-amber-600 font-medium">Not sent</span>}</span>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button onClick={() => { setSchedDialog(false); setSchedResult(null); }} className="w-full">
                  Close
                </Button>
              </DialogFooter>
            </div>
          ) : (
            /* ── Form view ── */
            <div className="space-y-4">
              {/* Enquiry info */}
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <strong>{schedEnquiry?.ref_number}</strong> — {schedEnquiry?.parent_name}
              </div>

              {/* Student selection */}
              {schedEnquiry && schedEnquiry.students?.length > 1 ? (
                <div>
                  <Label className="flex items-center gap-1 mb-1"><User className="h-3.5 w-3.5" /> Select Student</Label>
                  <Select value={String(schedForm.student_idx)} onValueChange={(v) => setSchedForm({ ...schedForm, student_idx: parseInt(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {schedEnquiry.students.map((s, i) => (
                        <SelectItem key={i} value={String(i)}>{s.name} — {s.desired_grade}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : schedEnquiry?.students?.length === 1 ? (
                <div>
                  <Label className="flex items-center gap-1 mb-1"><User className="h-3.5 w-3.5" /> Student</Label>
                  <div className="text-sm bg-muted/30 rounded px-3 py-2">
                    {schedEnquiry.students[0].name} — {schedEnquiry.students[0].desired_grade}
                  </div>
                </div>
              ) : null}

              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="flex items-center gap-1 mb-1"><CalendarDays className="h-3.5 w-3.5" /> Date *</Label>
                  <Input type="date" value={schedForm.date}
                    onChange={(e) => setSchedForm({ ...schedForm, date: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-1 mb-1"><Clock className="h-3.5 w-3.5" /> Time *</Label>
                  <Input type="time" value={schedForm.time}
                    onChange={(e) => setSchedForm({ ...schedForm, time: e.target.value })}
                  />
                </div>
              </div>

              {/* Place */}
              <div>
                <Label className="flex items-center gap-1 mb-1"><MapPin className="h-3.5 w-3.5" /> Place *</Label>
                <Select value={schedForm.place} onValueChange={(v) => setSchedForm({ ...schedForm, place: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLACE_OPTIONS.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Staff */}
              <div>
                <Label className="flex items-center gap-1 mb-1">
                  <User className="h-3.5 w-3.5" /> {schedType === "test" ? "Testing Teacher / Staff" : "Interviewer / Staff"}
                </Label>
                <Input placeholder="e.g. Mr. Ahmed" value={schedForm.staff}
                  onChange={(e) => setSchedForm({ ...schedForm, staff: e.target.value })}
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setSchedDialog(false)} disabled={schedSaving}>
                  Cancel
                </Button>
                <Button onClick={confirmSchedule} disabled={schedSaving || !schedForm.date || !schedForm.time}>
                  {schedSaving ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scheduling...</>
                  ) : (
                    <>Confirm & Notify Parent</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Quick-Notify Dialog (Contacted / Offer Sent) */}
      <Dialog open={notifyDialog} onOpenChange={(open) => { if (!open && !notifySaving) { setNotifyDialog(false); setNotifyResult(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              {notifyType === "contacted" ? "Send Application Info" : "Send Admission Offer"}
            </DialogTitle>
          </DialogHeader>

          {notifyResult ? (
            /* ── Result view ── */
            <div className="space-y-4 py-4">
              <div className={`flex flex-col items-center gap-2 text-center ${notifyResult.ok ? "text-green-600" : "text-red-600"}`}>
                {notifyResult.ok ? (
                  <CheckCircle2 className="h-12 w-12" />
                ) : (
                  <XCircle className="h-12 w-12" />
                )}
                <p className="font-semibold text-lg">
                  {notifyResult.ok ? "Notification Sent!" : "Send Failed"}
                </p>
              </div>
              {notifyResult.ok && (
                <div className="space-y-2 text-sm bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>Email: {notifyResult.email ? <span className="text-green-600 font-medium">Sent</span> : <span className="text-amber-600 font-medium">Not sent</span>}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span>WhatsApp: {notifyResult.whatsapp ? <span className="text-green-600 font-medium">Sent</span> : <span className="text-amber-600 font-medium">Not sent</span>}</span>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button onClick={() => { setNotifyDialog(false); setNotifyResult(null); }} className="w-full">
                  Close
                </Button>
              </DialogFooter>
            </div>
          ) : (
            /* ── Confirmation view ── */
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <strong>{notifyEnquiry?.ref_number}</strong> — {notifyEnquiry?.parent_name}
              </div>
              <div className="text-sm space-y-2">
                {notifyType === "contacted" ? (
                  <>
                    <p>This will send the parent:</p>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      <li>Welcome email with application checklist</li>
                      <li>Required documents list for admission</li>
                      {(notifyEnquiry?.source || "whatsapp") === "whatsapp" && (
                        <li>&quot;Why Khaled International Schools&quot; overview</li>
                      )}
                      <li>WhatsApp message with document requirements</li>
                    </ul>
                  </>
                ) : (
                  <>
                    <p>This will send the parent:</p>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      <li>Congratulations email with admission offer</li>
                      <li>Request to submit original documents</li>
                      <li>WhatsApp message with document checklist</li>
                    </ul>
                  </>
                )}
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{notifyEnquiry?.email || "No email"}</span>
                <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{notifyEnquiry?.phone || "No phone"}</span>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setNotifyDialog(false)} disabled={notifySaving}>
                  Cancel
                </Button>
                <Button onClick={confirmNotify} disabled={notifySaving}>
                  {notifySaving ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</>
                  ) : (
                    <>Confirm & Notify Parent</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
