"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { UserCheck, Plus, CheckCircle, XCircle, Clock, Search, AlertCircle } from "lucide-react";

interface Enquiry {
  ref_number: string;
  parent_name: string;
  phone: string;
  students: { name: string; gender: string; desired_grade: string }[];
  status: string;
}

interface Interview {
  id: string;
  enquiry_ref: string;
  parent_name: string;
  student_name: string;
  desired_grade: string;
  interview_date: string;
  interview_time: string;
  interviewer: string;
  outcome: "pending" | "recommended" | "not_recommended" | "follow_up";
  notes: string;
  created_at: string;
  updated_at: string;
}

const OUTCOME_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-800" },
  recommended: { label: "Recommended", color: "bg-green-100 text-green-800" },
  not_recommended: { label: "Not Recommended", color: "bg-red-100 text-red-800" },
  follow_up: { label: "Follow-up Needed", color: "bg-blue-100 text-blue-800" },
};

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [editInterview, setEditInterview] = useState<Interview | null>(null);
  const [saving, setSaving] = useState(false);

  const [schedForm, setSchedForm] = useState({
    enquiry_ref: "",
    student_index: 0,
    interview_date: "",
    interview_time: "",
    interviewer: "",
    student_name: "",
    student_grade: "",
  });

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admissions/interviews?includeEnquiries=1", { cache: "no-store" });
      const json = await res.json();
      const intList = (json.interviews || []) as Interview[];
      intList.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setInterviews(intList);

      setEnquiries((json.enquiries || []) as Enquiry[]);
    } catch (err) {
      console.error("Failed to load interviews:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const matchedEnquiry = enquiries.find((e) => e.ref_number === schedForm.enquiry_ref.toUpperCase().replace(/\s/g, ""));

  async function scheduleInterview() {
    if (!schedForm.enquiry_ref.trim() || !schedForm.interview_date) return;
    const enq = matchedEnquiry;
    const student = enq?.students?.[schedForm.student_index] ?? {
      name: schedForm.student_name || "TBD",
      gender: "",
      desired_grade: schedForm.student_grade || "TBD",
    };

    setSaving(true);
    try {
      const ref = schedForm.enquiry_ref.toUpperCase().replace(/\s/g, "");
      const intId = `${ref}_${student.name.replace(/\s+/g, "_")}_int_${Date.now()}`;
      const now = new Date().toISOString();
      const record: Omit<Interview, "id"> = {
        enquiry_ref: ref,
        parent_name: enq?.parent_name || ref,
        student_name: student.name,
        desired_grade: student.desired_grade,
        interview_date: schedForm.interview_date,
        interview_time: schedForm.interview_time,
        interviewer: schedForm.interviewer,
        outcome: "pending",
        notes: "",
        created_at: now,
        updated_at: now,
      };

      await fetch("/api/admissions/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...record, id: intId }),
      });

      setInterviews((prev) => [{ id: intId, ...record }, ...prev]);
      setShowScheduleDialog(false);
      setSchedForm({ enquiry_ref: "", student_index: 0, interview_date: "", interview_time: "", interviewer: "", student_name: "", student_grade: "" });
    } catch (err) {
      console.error("Failed to schedule interview:", err);
    } finally {
      setSaving(false);
    }
  }

  async function saveInterviewResult() {
    if (!editInterview) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await fetch("/api/admissions/interviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editInterview.id,
          enquiry_ref: editInterview.enquiry_ref,
          outcome: editInterview.outcome,
          notes: editInterview.notes,
          interviewer: editInterview.interviewer,
          updated_at: now,
        }),
      });

      setInterviews((prev) =>
        prev.map((i) => i.id === editInterview.id ? { ...editInterview, updated_at: now } : i)
      );
      setEditInterview(null);
    } catch (err) {
      console.error("Failed to save interview:", err);
    } finally {
      setSaving(false);
    }
  }

  const filtered = interviews.filter((i) => {
    if (outcomeFilter !== "all" && i.outcome !== outcomeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !i.enquiry_ref.toLowerCase().includes(q) &&
        !i.parent_name.toLowerCase().includes(q) &&
        !i.student_name.toLowerCase().includes(q) &&
        !i.interviewer.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Interviews</h1>
          <p className="text-sm text-muted-foreground">{interviews.length} interview records</p>
        </div>
        <Button size="sm" onClick={() => setShowScheduleDialog(true)}>
          <Plus className="mr-1 h-4 w-4" /> Schedule Interview
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {Object.entries(OUTCOME_CONFIG).map(([key, cfg]) => (
          <Card key={key}>
            <CardContent className="pt-6 flex items-center gap-3">
              {key === "pending" ? <Clock className="h-8 w-8 text-amber-500" /> :
               key === "recommended" ? <CheckCircle className="h-8 w-8 text-green-500" /> :
               key === "not_recommended" ? <XCircle className="h-8 w-8 text-red-500" /> :
               <AlertCircle className="h-8 w-8 text-blue-500" />}
              <div>
                <p className="text-2xl font-bold">{interviews.filter((i) => i.outcome === key).length}</p>
                <p className="text-xs text-muted-foreground">{cfg.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Outcomes</SelectItem>
            {Object.entries(OUTCOME_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
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
                  <TableHead>Ref #</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Date / Time</TableHead>
                  <TableHead>Interviewer</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No interviews found</TableCell>
                  </TableRow>
                ) : (
                  filtered.map((i) => {
                    const oc = OUTCOME_CONFIG[i.outcome] || { label: i.outcome, color: "" };
                    return (
                      <TableRow key={i.id} className="cursor-pointer" onClick={() => setEditInterview({ ...i })}>
                        <TableCell className="font-mono text-xs">{i.enquiry_ref}</TableCell>
                        <TableCell className="font-medium text-sm">{i.student_name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{i.desired_grade}</Badge></TableCell>
                        <TableCell className="text-sm">
                          {i.interview_date ? new Date(i.interview_date).toLocaleDateString("en-GB") : "—"}
                          {i.interview_time && ` at ${i.interview_time}`}
                        </TableCell>
                        <TableCell className="text-sm">{i.interviewer || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`text-xs ${oc.color}`}>{oc.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">Edit</Button>
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

      {/* Schedule dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule Interview</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Enquiry Ref # (e.g. ADM-1001)</Label>
              <Input
                placeholder="ADM-1001"
                value={schedForm.enquiry_ref}
                onChange={(e) => setSchedForm({ ...schedForm, enquiry_ref: e.target.value, student_index: 0 })}
              />
              {schedForm.enquiry_ref.trim() && (
                matchedEnquiry ? (
                  <p className="text-xs text-green-600 mt-1">
                    Matched: {matchedEnquiry.parent_name} — {matchedEnquiry.students?.length || 0} student(s)
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 mt-1">No matching enquiry found — you can still schedule manually</p>
                )
              )}
            </div>
            {matchedEnquiry && matchedEnquiry.students?.length > 1 && (
              <div>
                <Label>Student</Label>
                <Select value={String(schedForm.student_index)} onValueChange={(v) => setSchedForm({ ...schedForm, student_index: parseInt(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {matchedEnquiry.students.map((s, i) => (
                      <SelectItem key={i} value={String(i)}>{s.name} — {s.desired_grade}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!matchedEnquiry && schedForm.enquiry_ref.trim() && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Student Name</Label>
                  <Input placeholder="Student name" value={schedForm.student_name}
                    onChange={(e) => setSchedForm({ ...schedForm, student_name: e.target.value })} />
                </div>
                <div>
                  <Label>Grade</Label>
                  <Input placeholder="e.g. Grade 4" value={schedForm.student_grade}
                    onChange={(e) => setSchedForm({ ...schedForm, student_grade: e.target.value })} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Date</Label>
                <Input type="date" value={schedForm.interview_date} onChange={(e) => setSchedForm({ ...schedForm, interview_date: e.target.value })} />
              </div>
              <div>
                <Label>Time</Label>
                <Input type="time" value={schedForm.interview_time} onChange={(e) => setSchedForm({ ...schedForm, interview_time: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Interviewer</Label>
              <Input placeholder="Interviewer name" value={schedForm.interviewer} onChange={(e) => setSchedForm({ ...schedForm, interviewer: e.target.value })} />
            </div>
            <Button onClick={scheduleInterview} disabled={saving || !schedForm.enquiry_ref.trim() || !schedForm.interview_date} className="w-full">
              {saving ? "Scheduling..." : "Schedule Interview"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editInterview} onOpenChange={(open) => { if (!open) setEditInterview(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Interview — {editInterview?.student_name}</DialogTitle></DialogHeader>
          {editInterview && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {editInterview.enquiry_ref} · {editInterview.desired_grade} ·{" "}
                {editInterview.interview_date ? new Date(editInterview.interview_date).toLocaleDateString("en-GB") : "TBD"}
                {editInterview.interview_time && ` at ${editInterview.interview_time}`}
              </div>
              <div>
                <Label>Interviewer</Label>
                <Input value={editInterview.interviewer} onChange={(e) => setEditInterview({ ...editInterview, interviewer: e.target.value })} />
              </div>
              <div>
                <Label>Outcome</Label>
                <Select value={editInterview.outcome} onValueChange={(v) => setEditInterview({ ...editInterview, outcome: v as Interview["outcome"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(OUTCOME_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={editInterview.notes} onChange={(e) => setEditInterview({ ...editInterview, notes: e.target.value })} rows={4}
                  placeholder="Interview observations, parent responses, recommendations..."
                />
              </div>
              <Button onClick={saveInterviewResult} disabled={saving} className="w-full">
                {saving ? "Saving..." : "Save Interview"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
