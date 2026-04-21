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
import { TestTube, Plus, CheckCircle, XCircle, Clock, Search } from "lucide-react";
import { getDb } from "@/lib/firebase";
import {
  collection, getDocs, doc, setDoc, updateDoc,
} from "firebase/firestore";

interface Student { name: string; gender: string; desired_grade: string }

interface Enquiry {
  ref_number: string;
  parent_name: string;
  phone: string;
  students: Student[];
  status: string;
}

interface TestRecord {
  id: string;
  enquiry_ref: string;
  parent_name: string;
  student_name: string;
  desired_grade: string;
  test_date: string;
  math_score: number | null;
  english_score: number | null;
  arabic_score: number | null;
  result: "pending" | "pass" | "fail";
  notes: string;
  created_at: string;
  updated_at: string;
}

export default function EntranceTestsPage() {
  const [tests, setTests] = useState<TestRecord[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("all");
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [editTest, setEditTest] = useState<TestRecord | null>(null);
  const [saving, setSaving] = useState(false);

  // Schedule form
  const [schedForm, setSchedForm] = useState({
    enquiry_ref: "",
    student_index: 0,
    test_date: "",
    student_name: "",
    student_grade: "",
  });

  const fetchData = useCallback(async () => {
    try {
      const db = getDb();
      const [testSnap, enqSnap] = await Promise.all([
        getDocs(collection(db, "admission_tests")),
        getDocs(collection(db, "admission_enquiries")),
      ]);
      const testList: TestRecord[] = [];
      testSnap.forEach((d) => {
        const raw = d.data();
        testList.push({
          id: d.id,
          enquiry_ref: raw.enquiry_ref || raw.ref_number || "",
          parent_name: raw.parent_name || "",
          student_name: raw.student_name || "",
          desired_grade: raw.desired_grade || raw.student_grade || "",
          test_date: raw.test_date || raw.date || "",
          math_score: raw.math_score ?? null,
          english_score: raw.english_score ?? null,
          arabic_score: raw.arabic_score ?? null,
          result: raw.result || (raw.status === "scheduled" ? "pending" : "pending"),
          notes: raw.notes || "",
          created_at: raw.created_at || "",
          updated_at: raw.updated_at || raw.created_at || "",
        });
      });
      testList.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      setTests(testList);

      const enqList: Enquiry[] = [];
      enqSnap.forEach((d) => enqList.push(d.data() as Enquiry));
      setEnquiries(enqList);
    } catch (err) {
      console.error("Failed to load tests:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Schedule test ── */
  const matchedEnquiry = enquiries.find((e) => e.ref_number === schedForm.enquiry_ref.toUpperCase().replace(/\s/g, ""));

  async function scheduleTest() {
    if (!schedForm.enquiry_ref.trim() || !schedForm.test_date) return;
    const enq = matchedEnquiry;
    const student = enq?.students?.[schedForm.student_index] ?? {
      name: schedForm.student_name || "TBD",
      gender: "",
      desired_grade: schedForm.student_grade || "TBD",
    };

    setSaving(true);
    try {
      const db = getDb();
      const ref = schedForm.enquiry_ref.toUpperCase().replace(/\s/g, "");
      const testId = `${ref}_${student.name.replace(/\s+/g, "_")}_${Date.now()}`;
      const now = new Date().toISOString();
      const record: Omit<TestRecord, "id"> = {
        enquiry_ref: ref,
        parent_name: enq?.parent_name || ref,
        student_name: student.name,
        desired_grade: student.desired_grade,
        test_date: schedForm.test_date,
        math_score: null,
        english_score: null,
        arabic_score: null,
        result: "pending",
        notes: "",
        created_at: now,
        updated_at: now,
      };

      await setDoc(doc(db, "admission_tests", testId), record);
      // Also update enquiry status
      if (enq && (enq.status === "contacted" || enq.status === "new")) {
        await updateDoc(doc(db, "admission_enquiries", enq.ref_number), {
          status: "test_scheduled",
          updated_at: now,
        });
      }

      setTests((prev) => [{ id: testId, ...record }, ...prev]);
      setShowScheduleDialog(false);
      setSchedForm({ enquiry_ref: "", student_index: 0, test_date: "", student_name: "", student_grade: "" });
    } catch (err) {
      console.error("Failed to schedule test:", err);
    } finally {
      setSaving(false);
    }
  }

  /* ── Update test scores ── */
  async function saveTestScores() {
    if (!editTest) return;
    setSaving(true);
    try {
      const db = getDb();
      const now = new Date().toISOString();
      const update = {
        math_score: editTest.math_score,
        english_score: editTest.english_score,
        arabic_score: editTest.arabic_score,
        result: editTest.result,
        notes: editTest.notes,
        updated_at: now,
      };
      await updateDoc(doc(db, "admission_tests", editTest.id), update);

      // Update enquiry status to test_done if all tests for that enquiry have results
      if (editTest.result !== "pending") {
        await updateDoc(doc(db, "admission_enquiries", editTest.enquiry_ref), {
          status: "test_done",
          updated_at: now,
        });
      }

      setTests((prev) =>
        prev.map((t) => t.id === editTest.id ? { ...editTest, updated_at: now } : t)
      );
      setEditTest(null);
    } catch (err) {
      console.error("Failed to save scores:", err);
    } finally {
      setSaving(false);
    }
  }

  /* ── Filter ── */
  const filtered = tests.filter((t) => {
    if (resultFilter !== "all" && t.result !== resultFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !t.enquiry_ref.toLowerCase().includes(q) &&
        !t.parent_name.toLowerCase().includes(q) &&
        !t.student_name.toLowerCase().includes(q)
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
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Entrance Tests</h1>
          <p className="text-sm text-muted-foreground">{tests.length} test records</p>
        </div>
        <Button size="sm" onClick={() => setShowScheduleDialog(true)}>
          <Plus className="mr-1 h-4 w-4" /> Schedule Test
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Clock className="h-8 w-8 text-amber-500" />
            <div>
              <p className="text-2xl font-bold">{tests.filter((t) => t.result === "pending").length}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{tests.filter((t) => t.result === "pass").length}</p>
              <p className="text-xs text-muted-foreground">Passed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <XCircle className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold">{tests.filter((t) => t.result === "fail").length}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, ref#..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={resultFilter} onValueChange={setResultFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Results</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="pass">Pass</SelectItem>
            <SelectItem value="fail">Fail</SelectItem>
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
                  <TableHead>Test Date</TableHead>
                  <TableHead className="text-center">Math</TableHead>
                  <TableHead className="text-center">English</TableHead>
                  <TableHead className="text-center">Arabic</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No test records found</TableCell>
                  </TableRow>
                ) : (
                  filtered.map((t) => (
                    <TableRow key={t.id} className="cursor-pointer" onClick={() => setEditTest({ ...t })}>
                      <TableCell className="font-mono text-xs">{t.enquiry_ref}</TableCell>
                      <TableCell className="font-medium text-sm">{t.student_name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{t.desired_grade}</Badge></TableCell>
                      <TableCell className="text-sm">{t.test_date ? new Date(t.test_date).toLocaleDateString("en-GB") : "—"}</TableCell>
                      <TableCell className="text-center text-sm">{t.math_score ?? "—"}</TableCell>
                      <TableCell className="text-center text-sm">{t.english_score ?? "—"}</TableCell>
                      <TableCell className="text-center text-sm">{t.arabic_score ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-xs ${
                          t.result === "pass" ? "bg-green-100 text-green-800" :
                          t.result === "fail" ? "bg-red-100 text-red-800" :
                          "bg-amber-100 text-amber-800"
                        }`}>
                          {t.result === "pass" ? "Pass" : t.result === "fail" ? "Fail" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">Edit</Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Schedule dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule Entrance Test</DialogTitle></DialogHeader>
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
            <div>
              <Label>Test Date</Label>
              <Input type="date" value={schedForm.test_date} onChange={(e) => setSchedForm({ ...schedForm, test_date: e.target.value })} />
            </div>
            <Button onClick={scheduleTest} disabled={saving || !schedForm.enquiry_ref.trim() || !schedForm.test_date} className="w-full">
              {saving ? "Scheduling..." : "Schedule Test"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit scores dialog */}
      <Dialog open={!!editTest} onOpenChange={(open) => { if (!open) setEditTest(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Test Scores — {editTest?.student_name}</DialogTitle></DialogHeader>
          {editTest && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {editTest.enquiry_ref} · {editTest.desired_grade} · Test: {editTest.test_date ? new Date(editTest.test_date).toLocaleDateString("en-GB") : "TBD"}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Math</Label>
                  <Input type="number" min={0} max={100} value={editTest.math_score ?? ""}
                    onChange={(e) => setEditTest({ ...editTest, math_score: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
                <div>
                  <Label>English</Label>
                  <Input type="number" min={0} max={100} value={editTest.english_score ?? ""}
                    onChange={(e) => setEditTest({ ...editTest, english_score: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
                <div>
                  <Label>Arabic</Label>
                  <Input type="number" min={0} max={100} value={editTest.arabic_score ?? ""}
                    onChange={(e) => setEditTest({ ...editTest, arabic_score: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
              </div>
              <div>
                <Label>Result</Label>
                <Select value={editTest.result} onValueChange={(v) => setEditTest({ ...editTest, result: v as TestRecord["result"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="pass">Pass</SelectItem>
                    <SelectItem value="fail">Fail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={editTest.notes} onChange={(e) => setEditTest({ ...editTest, notes: e.target.value })} rows={3} />
              </div>
              <Button onClick={saveTestScores} disabled={saving} className="w-full">
                {saving ? "Saving..." : "Save Scores"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
