"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Send,
  MessageSquare,
  Users,
  School,
  BookOpen,
  User,
  Loader2,
  CheckCircle2,
  Clock,
  Eye,
  Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/context/auth-context";
import { useAcademicYear } from "@/context/academic-year-context";
import { useSchoolFilter } from "@/context/school-filter-context";
import {
  collection,
  query,
  orderBy,
  getDocs,
  where,
  limit,
  Timestamp,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { useClassNames } from "@/hooks/use-classes";

/* ─── Types ─── */
interface Message {
  id: string;
  title: string;
  body: string;
  sender: string;
  audience: string;
  audience_filter: Record<string, string>;
  created_at: Date | null;
  read_count: number;
}

type Audience = "all" | "school" | "class" | "family";

const AUDIENCES: { value: Audience; label: string; icon: React.ElementType }[] = [
  { value: "all", label: "All Parents", icon: Users },
  { value: "school", label: "By School", icon: School },
  { value: "class", label: "By Class", icon: BookOpen },
  { value: "family", label: "Specific Family", icon: User },
];

const EXCLUDED_CLASS_CODES = new Set(["34", "51"]); // 34=Terminated, 51=OtherC

/* ─── Page ─── */
export default function MessagesPage() {
  const { user } = useAuth();
  const { selectedYear } = useAcademicYear();
  const { schoolFilter, locked: schoolLocked } = useSchoolFilter();

  // Compose state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [school, setSchool] = useState("");
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]); // "10" or "10__A"
  const [familyNumber, setFamilyNumber] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    success: boolean;
    pushSent: number;
    pushTokensFound: number;
  } | null>(null);

  // Dynamic class/section data
  const [classSections, setClassSections] = useState<
    { classCode: string; sectionCode: string; sectionName: string }[]
  >([]);
  const { classNameMap } = useClassNames();
  const [loadingSections, setLoadingSections] = useState(false);

  // History state
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    if (schoolFilter !== "all") setSchool(schoolFilter);
    else if (schoolLocked) setSchool("");
  }, [schoolFilter, schoolLocked]);

  /* ─── Load sections when school changes ─── */
  useEffect(() => {
    if (!school || audience !== "class") {
      setClassSections([]);
      setSelectedTargets([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingSections(true);
      try {
        const q = query(
          collection(getDb(), "sections"),
          where("Academic_Year", "==", selectedYear || "25-26"),
          where("Major_Code", "==", school)
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const items: { classCode: string; sectionCode: string; sectionName: string }[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          const classCode = String(data.Class_Code || "");
          if (classCode && data.Section_Code && !EXCLUDED_CLASS_CODES.has(classCode)) {
            items.push({
              classCode,
              sectionCode: String(data.Section_Code),
              sectionName: String(data.E_Section_Name || data.Section_Code),
            });
          }
        });
        // Sort by class name then section name
        items.sort((a, b) => {
          const nameA = classNameMap[a.classCode] || a.classCode;
          const nameB = classNameMap[b.classCode] || b.classCode;
          // Extract grade number from names like "Grade 1", "Grade 10"
          const numA = parseInt(nameA.replace(/\D/g, "")) || 0;
          const numB = parseInt(nameB.replace(/\D/g, "")) || 0;
          if (numA !== numB) return numA - numB;
          return a.sectionName.localeCompare(b.sectionName);
        });
        setClassSections(items);
      } catch (err) {
        console.error("Failed to load sections:", err);
      }
      setLoadingSections(false);
    })();
    return () => { cancelled = true; };
  }, [school, audience, classNameMap]);

  // Reset selected targets when school changes
  useEffect(() => {
    setSelectedTargets([]);
  }, [school]);

  /* ─── Derived: unique classes, sections grouped by class ─── */
  const uniqueClasses = [...new Set(classSections.map((s) => s.classCode))].sort(
    (a, b) => {
      const nameA = classNameMap[a] || a;
      const nameB = classNameMap[b] || b;
      const numA = parseInt(nameA.replace(/\D/g, "")) || 0;
      const numB = parseInt(nameB.replace(/\D/g, "")) || 0;
      return numA - numB;
    }
  );

  // sectionCode → sectionName lookup
  const sectionNameMap = classSections.reduce<Record<string, string>>(
    (acc, { classCode, sectionCode, sectionName }) => {
      acc[`${classCode}__${sectionCode}`] = sectionName;
      return acc;
    },
    {}
  );

  const sectionsByClass = classSections.reduce<Record<string, string[]>>(
    (acc, { classCode, sectionCode }) => {
      if (!acc[classCode]) acc[classCode] = [];
      if (!acc[classCode].includes(sectionCode)) acc[classCode].push(sectionCode);
      return acc;
    },
    {}
  );

  /* ─── Multi-select helpers ─── */
  const toggleTarget = (key: string) => {
    setSelectedTargets((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleWholeClass = (classCode: string) => {
    const classSectionKeys = (sectionsByClass[classCode] || []).map(
      (sec) => `${classCode}__${sec}`
    );
    const allSelected = classSectionKeys.every((k) => selectedTargets.includes(k));
    if (allSelected) {
      // Deselect all sections of this class + the class-level key
      setSelectedTargets((prev) =>
        prev.filter((k) => !classSectionKeys.includes(k) && k !== classCode)
      );
    } else {
      // Select all sections of this class
      setSelectedTargets((prev) => {
        const next = prev.filter((k) => !classSectionKeys.includes(k) && k !== classCode);
        return [...next, ...classSectionKeys];
      });
    }
  };

  const selectAll = () => {
    const allKeys = classSections.map((s) => `${s.classCode}__${s.sectionCode}`);
    setSelectedTargets(allKeys);
  };

  const deselectAll = () => setSelectedTargets([]);

  /* ─── Load message history ─── */
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const q = query(collection(getDb(), "messages"), orderBy("created_at", "desc"), limit(100));
      const snap = await getDocs(q);
      const msgs: Message[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title || "",
          body: data.body || "",
          sender: data.sender || "",
          audience: data.audience || "all",
          audience_filter: data.audience_filter || {},
          created_at: data.created_at instanceof Timestamp ? data.created_at.toDate() : null,
          read_count: (data.read_by || []).length,
        };
      });
      setMessages(msgs);
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  /* ─── Send message ─── */
  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setSendResult(null);

    const audienceFilter: Record<string, string | { class: string; className?: string; section?: string; sectionName?: string }[]> = {};
    if (audience === "school") audienceFilter.school = school;
    if (audience === "class") {
      audienceFilter.school = school;
      // Build targets array from selectedTargets with readable names
      const targets: { class: string; className?: string; section?: string; sectionName?: string }[] = [];
      for (const key of selectedTargets) {
        if (key.includes("__")) {
          const [c, s] = key.split("__");
          targets.push({
            class: c,
            className: classNameMap[c] || c,
            section: s,
            sectionName: sectionNameMap[`${c}__${s}`] || s,
          });
        } else {
          targets.push({ class: key, className: classNameMap[key] || key });
        }
      }
      audienceFilter.targets = targets;
    }
    if (audience === "family") audienceFilter.family_number = familyNumber;

    try {
      const resp = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          audience,
          audience_filter: audienceFilter,
          sender: user?.email || "Admin",
        }),
      });
      const result = await resp.json();
      if (resp.ok) {
        setSendResult({
          success: true,
          pushSent: result.pushSent,
          pushTokensFound: result.pushTokensFound,
        });
        setTitle("");
        setBody("");
        setAudience("all");
        setSchool(schoolFilter !== "all" ? schoolFilter : "");
        setSelectedTargets([]);
        setFamilyNumber("");
        loadHistory();
      } else {
        setSendResult({ success: false, pushSent: 0, pushTokensFound: 0 });
      }
    } catch {
      setSendResult({ success: false, pushSent: 0, pushTokensFound: 0 });
    }
    setSending(false);
  };

  /* ─── Audience label helper ─── */
  const audienceLabel = (msg: Message) => {
    const f = msg.audience_filter;
    switch (msg.audience) {
      case "all":
        return "All Parents";
      case "school":
        return f.school === "0021-01" ? "Boys School" : f.school === "0021-02" ? "Girls School" : f.school;
      case "class": {
        const schoolLabel = f.school === "0021-01" ? "Boys" : "Girls";
        if (Array.isArray(f.targets)) {
          const parts = f.targets.map(
            (t: { class: string; className?: string; section?: string; sectionName?: string }) =>
              `${t.className || classNameMap[t.class] || t.class}${t.sectionName || t.section ? ` ${t.sectionName || t.section}` : ""}`
          );
          return `${schoolLabel} – ${parts.slice(0, 3).join(", ")}${parts.length > 3 ? ` +${parts.length - 3} more` : ""}`;
        }
        return `${schoolLabel} – ${classNameMap[f.class] || f.class || ""}${f.section ? ` (${f.section})` : ""}`;
      }
      case "family":
        return `Family #${f.family_number}`;
      default:
        return msg.audience;
    }
  };

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          Messages to Parents
        </h1>
        <p className="text-muted-foreground mt-1">
          Compose and send custom messages to parents via the mobile app with push notifications.
        </p>
      </div>

      {/* ── Compose Card ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Compose Message
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Title */}
          <div>
            <label className="text-sm font-medium mb-1 block">Title</label>
            <Input
              placeholder="e.g. Fee Payment Reminder"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Body */}
          <div>
            <label className="text-sm font-medium mb-1 block">Message</label>
            <textarea
              className="w-full min-h-[120px] rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              placeholder="Type your message to parents..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground mt-1">{body.length}/2000 characters</p>
          </div>

          <Separator />

          {/* Audience selector */}
          <div>
            <label className="text-sm font-medium mb-2 block">Send To</label>
            <div className="flex flex-wrap gap-2">
              {AUDIENCES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setAudience(value)}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    audience === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Audience-specific filters */}
          {(audience === "school" || audience === "class") && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block">School</label>
                  <select
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                    disabled={schoolLocked && schoolFilter !== "all"}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="">Select school</option>
                    <option value="0021-01">Boys School</option>
                    <option value="0021-02">Girls School</option>
                  </select>
                </div>
              </div>

              {/* Class / Section multi-select list */}
              {audience === "class" && school && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium">Select Classes & Sections</label>
                    {classSections.length > 0 && (
                      <div className="flex gap-2">
                        <button
                          onClick={selectAll}
                          className="text-xs text-primary hover:underline"
                        >
                          Select All
                        </button>
                        <button
                          onClick={deselectAll}
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>

                  {loadingSections ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading classes…
                    </div>
                  ) : classSections.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      No classes found for this school.
                    </p>
                  ) : (
                    <div className="border rounded-md max-h-64 overflow-y-auto divide-y">
                      {uniqueClasses.map((classCode) => {
                        const sections = sectionsByClass[classCode] || [];
                        const classSectionKeys = sections.map((s) => `${classCode}__${s}`);
                        const allSelected = classSectionKeys.every((k) =>
                          selectedTargets.includes(k)
                        );
                        const someSelected =
                          !allSelected &&
                          classSectionKeys.some((k) => selectedTargets.includes(k));

                        return (
                          <div key={classCode} className="px-3 py-2">
                            {/* Class header row */}
                            <button
                              onClick={() => toggleWholeClass(classCode)}
                              className="flex items-center gap-2 w-full text-left"
                            >
                              <span
                                className={`flex h-4 w-4 items-center justify-center rounded border text-xs ${
                                  allSelected
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : someSelected
                                    ? "bg-primary/30 border-primary"
                                    : "border-border"
                                }`}
                              >
                                {allSelected && <Check className="h-3 w-3" />}
                                {someSelected && !allSelected && (
                                  <span className="block h-1.5 w-1.5 rounded-sm bg-primary" />
                                )}
                              </span>
                              <span className="text-sm font-semibold">{classNameMap[classCode] || `Class ${classCode}`}</span>
                              <span className="text-xs text-muted-foreground">
                                ({sections.length} section{sections.length !== 1 ? "s" : ""})
                              </span>
                            </button>

                            {/* Section chips */}
                            <div className="flex flex-wrap gap-1.5 mt-1.5 ml-6">
                              {sections.map((sec) => {
                                const key = `${classCode}__${sec}`;
                                const selected = selectedTargets.includes(key);
                                return (
                                  <button
                                    key={key}
                                    onClick={() => toggleTarget(key)}
                                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors ${
                                      selected
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border text-muted-foreground hover:bg-muted"
                                    }`}
                                  >
                                    {selected && <Check className="h-3 w-3" />}
                                    {sectionNameMap[`${classCode}__${sec}`] || sec}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {selectedTargets.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {selectedTargets.length} section{selectedTargets.length !== 1 ? "s" : ""} selected
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {audience === "family" && (
            <div>
              <label className="text-xs font-medium mb-1 block">Family Number</label>
              <Input
                placeholder="e.g. 12345"
                value={familyNumber}
                onChange={(e) => setFamilyNumber(e.target.value)}
                className="w-48"
              />
            </div>
          )}

          <Separator />

          {/* Send button + result */}
          <div className="flex items-center gap-4">
            <Button
              onClick={handleSend}
              disabled={
                sending ||
                !title.trim() ||
                !body.trim() ||
                (audience === "class" && selectedTargets.length === 0)
              }
              className="gap-2"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending ? "Sending…" : "Send Message"}
            </Button>

            {sendResult && (
              <div className={`flex items-center gap-2 text-sm ${sendResult.success ? "text-green-500" : "text-red-500"}`}>
                {sendResult.success ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Message sent! Push delivered to {sendResult.pushSent} device(s).
                  </>
                ) : (
                  "Failed to send. Please try again."
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Message History ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Message History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No messages sent yet. Compose your first message above.
            </p>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="flex items-start gap-4 rounded-lg border p-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm truncate">{msg.title}</h3>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {audienceLabel(msg)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{msg.body}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{msg.sender}</span>
                      <span>
                        {msg.created_at
                          ? msg.created_at.toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                    <Eye className="h-4 w-4" />
                    <span className="text-xs">{msg.read_count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
