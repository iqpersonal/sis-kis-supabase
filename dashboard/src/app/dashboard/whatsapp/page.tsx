"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Send,
  Phone,
  Users,
  School,
  BookOpen,
  User,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/context/auth-context";
import { useAcademicYear } from "@/context/academic-year-context";
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
interface WhatsAppMessage {
  id: string;
  mode: string;
  templateName: string | null;
  text: string | null;
  audience: string;
  audience_filter: Record<string, string>;
  sender: string;
  total_recipients: number;
  sent: number;
  failed: number;
  created_at: Date | null;
}

type Audience = "all" | "school" | "class" | "family";
type Mode = "template" | "text";

const AUDIENCES: { value: Audience; label: string; icon: React.ElementType }[] = [
  { value: "all", label: "All Parents", icon: Users },
  { value: "school", label: "By School", icon: School },
  { value: "class", label: "By Class", icon: BookOpen },
  { value: "family", label: "Specific Family", icon: User },
];

const EXCLUDED_CLASS_CODES = new Set(["34", "51"]);

/* ─── Page ─── */
export default function WhatsAppPage() {
  const { user } = useAuth();
  const { selectedYear } = useAcademicYear();

  // Compose state
  const [mode, setMode] = useState<Mode>("template");
  const [templateName, setTemplateName] = useState("");
  const [languageCode, setLanguageCode] = useState("ar");
  const [templateParams, setTemplateParams] = useState(""); // comma-separated body params
  const [text, setText] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [school, setSchool] = useState("");
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [familyNumber, setFamilyNumber] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    success: boolean;
    sent: number;
    failed: number;
    total: number;
    configured?: boolean;
    errors?: { phone: string; error: string }[];
  } | null>(null);

  // Dynamic class/section data
  const [classSections, setClassSections] = useState<
    { classCode: string; sectionCode: string; sectionName: string }[]
  >([]);
  const { classNameMap } = useClassNames();
  const [loadingSections, setLoadingSections] = useState(false);

  // History state
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // API config status
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);

  /* ─── Check API configuration ─── */
  useEffect(() => {
    fetch("/api/whatsapp/status")
      .then((r) => r.json())
      .then((d) => setApiConfigured(d.configured ?? false))
      .catch(() => setApiConfigured(false));
  }, []);

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
        items.sort((a, b) => {
          const nameA = classNameMap[a.classCode] || a.classCode;
          const nameB = classNameMap[b.classCode] || b.classCode;
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

  useEffect(() => { setSelectedTargets([]); }, [school]);

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
      setSelectedTargets((prev) =>
        prev.filter((k) => !classSectionKeys.includes(k) && k !== classCode)
      );
    } else {
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

  /* ─── Load WhatsApp message history ─── */
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const q = query(collection(getDb(), "whatsapp_messages"), orderBy("created_at", "desc"), limit(100));
      const snap = await getDocs(q);
      const msgs: WhatsAppMessage[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          mode: data.mode || "template",
          templateName: data.templateName || null,
          text: data.text || null,
          audience: data.audience || "all",
          audience_filter: data.audience_filter || {},
          sender: data.sender || "",
          total_recipients: data.total_recipients || 0,
          sent: data.sent || 0,
          failed: data.failed || 0,
          created_at: data.created_at instanceof Timestamp ? data.created_at.toDate() : null,
        };
      });
      setMessages(msgs);
    } catch (err) {
      console.error("Failed to load WhatsApp history:", err);
    }
    setHistoryLoading(false);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  /* ─── Send WhatsApp message ─── */
  const handleSend = async () => {
    if (mode === "template" && !templateName.trim()) return;
    if (mode === "text" && !text.trim()) return;
    setSending(true);
    setSendResult(null);

    // Build audience filter
    const audienceFilter: Record<string, unknown> = {};
    if (audience === "school") audienceFilter.school = school;
    if (audience === "class") {
      audienceFilter.school = school;
      const targets: { class: string; section?: string }[] = [];
      for (const key of selectedTargets) {
        if (key.includes("__")) {
          const [c, s] = key.split("__");
          targets.push({ class: c, section: s });
        } else {
          targets.push({ class: key });
        }
      }
      audienceFilter.targets = targets;
    }
    if (audience === "family") audienceFilter.family_number = familyNumber;

    // Build template components (body params)
    let components: unknown[] | undefined;
    if (mode === "template" && templateParams.trim()) {
      const params = templateParams.split(",").map((p) => p.trim()).filter(Boolean);
      if (params.length > 0) {
        components = [
          {
            type: "body",
            parameters: params.map((p) => ({ type: "text", text: p })),
          },
        ];
      }
    }

    try {
      const resp = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          audience,
          audience_filter: audienceFilter,
          sender: user?.email || "Admin",
          templateName: mode === "template" ? templateName.trim() : undefined,
          languageCode: mode === "template" ? languageCode : undefined,
          components,
          text: mode === "text" ? text.trim() : undefined,
        }),
      });
      const result = await resp.json();
      if (resp.ok) {
        setSendResult({
          success: true,
          sent: result.sent,
          failed: result.failed,
          total: result.total,
          errors: result.errors,
          configured: result.configured ?? true,
        });
        setTemplateName("");
        setTemplateParams("");
        setText("");
        setAudience("all");
        setSchool("");
        setSelectedTargets([]);
        setFamilyNumber("");
        loadHistory();
      } else {
        setSendResult({
          success: false,
          sent: 0,
          failed: 0,
          total: 0,
          errors: [{ phone: "", error: result.error || "Unknown error" }],
        });
      }
    } catch {
      setSendResult({
        success: false,
        sent: 0,
        failed: 0,
        total: 0,
      });
    }
    setSending(false);
  };

  /* ─── Audience label helper ─── */
  const audienceLabel = (msg: WhatsAppMessage) => {
    const f = msg.audience_filter;
    switch (msg.audience) {
      case "all":
        return "All Parents";
      case "school":
        return f.school === "0021-01" ? "Boys School" : f.school === "0021-02" ? "Girls School" : f.school;
      case "class": {
        const schoolLabel = f.school === "0021-01" ? "Boys" : "Girls";
        return `${schoolLabel} – class targets`;
      }
      case "family":
        return `Family #${f.family_number}`;
      default:
        return msg.audience;
    }
  };

  /* ─── Can send? ─── */
  const canSend =
    !sending &&
    (mode === "template" ? templateName.trim() : text.trim()) &&
    (audience !== "class" || selectedTargets.length > 0) &&
    (audience !== "school" || school) &&
    (audience !== "family" || familyNumber.trim());

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Phone className="h-6 w-6 text-green-600" />
          WhatsApp Messages
        </h1>
        <p className="text-muted-foreground mt-1">
          Send WhatsApp messages to parents using the WhatsApp Business API.
        </p>
      </div>

      {/* API configuration banner */}
      {apiConfigured === false && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
              WhatsApp API not configured yet
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
              The dashboard is ready. Once you provide the WhatsApp Business API credentials, add
              <code className="mx-1 px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded text-[11px]">WHATSAPP_ACCESS_TOKEN</code>
              and
              <code className="mx-1 px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded text-[11px]">WHATSAPP_PHONE_NUMBER_ID</code>
              to <code className="mx-1 px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded text-[11px]">.env.local</code> and restart the server.
              Until then, messages will be recorded in history but not delivered.
            </p>
          </div>
        </div>
      )}

      {/* ── Compose Card ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Compose WhatsApp Message
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode selector */}
          <div>
            <label className="text-sm font-medium mb-2 block">Message Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setMode("template")}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  mode === "template"
                    ? "border-green-600 bg-green-600/10 text-green-700"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                Template Message
              </button>
              <button
                onClick={() => setMode("text")}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  mode === "text"
                    ? "border-green-600 bg-green-600/10 text-green-700"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                Free Text (24h window)
              </button>
            </div>
          </div>

          {/* Template mode fields */}
          {mode === "template" && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Template Name</label>
                <Input
                  placeholder="e.g. fee_reminder, absence_alert, grade_notification"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use the exact template name as approved in your Meta Business account.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Language</label>
                <select
                  value={languageCode}
                  onChange={(e) => setLanguageCode(e.target.value)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="ar">Arabic (ar)</option>
                  <option value="en">English (en)</option>
                  <option value="en_US">English US (en_US)</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">
                  Template Parameters <span className="text-muted-foreground">(optional)</span>
                </label>
                <Input
                  placeholder="param1, param2, param3 (comma-separated values for {{1}}, {{2}}, ...)"
                  value={templateParams}
                  onChange={(e) => setTemplateParams(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  These fill the {`{{1}}, {{2}}`}, … placeholders in your template body.
                </p>
              </div>
            </div>
          )}

          {/* Text mode field */}
          {mode === "text" && (
            <div>
              <label className="text-sm font-medium mb-1 block">Message</label>
              <textarea
                className="w-full min-h-[120px] rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                placeholder="Type your WhatsApp message... (only works if the parent has messaged you in the last 24 hours)"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={4096}
              />
              <p className="text-xs text-muted-foreground mt-1">{text.length}/4096 characters</p>
              <div className="flex items-start gap-2 mt-2 p-2 rounded-md bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                <p className="text-xs text-yellow-700 dark:text-yellow-400">
                  Free-text messages can only be sent within 24 hours of the parent&apos;s last message to you.
                  For business-initiated messages, use a pre-approved template instead.
                </p>
              </div>
            </div>
          )}

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
                      ? "border-green-600 bg-green-600/10 text-green-700"
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
                        <button onClick={selectAll} className="text-xs text-green-600 hover:underline">
                          Select All
                        </button>
                        <button onClick={deselectAll} className="text-xs text-muted-foreground hover:underline">
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
                        const allSelected = classSectionKeys.every((k) => selectedTargets.includes(k));
                        const someSelected = !allSelected && classSectionKeys.some((k) => selectedTargets.includes(k));

                        return (
                          <div key={classCode} className="px-3 py-2">
                            <button
                              onClick={() => toggleWholeClass(classCode)}
                              className="flex items-center gap-2 w-full text-left"
                            >
                              <span
                                className={`flex h-4 w-4 items-center justify-center rounded border text-xs ${
                                  allSelected
                                    ? "bg-green-600 border-green-600 text-white"
                                    : someSelected
                                    ? "bg-green-600/30 border-green-600"
                                    : "border-border"
                                }`}
                              >
                                {allSelected && <Check className="h-3 w-3" />}
                                {someSelected && !allSelected && (
                                  <span className="block h-1.5 w-1.5 rounded-sm bg-green-600" />
                                )}
                              </span>
                              <span className="text-sm font-semibold">
                                {classNameMap[classCode] || `Class ${classCode}`}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                ({sections.length} section{sections.length !== 1 ? "s" : ""})
                              </span>
                            </button>
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
                                        ? "border-green-600 bg-green-600/10 text-green-700"
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
              disabled={!canSend}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending ? "Sending…" : "Send via WhatsApp"}
            </Button>

            {sendResult && (
              <div
                className={`flex items-center gap-2 text-sm ${
                  sendResult.success ? "text-green-600" : "text-red-500"
                }`}
              >
                {sendResult.success ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    {sendResult.configured === false ? (
                      <>Recorded {sendResult.total} recipient(s) — messages will deliver once API is configured.</>
                    ) : (
                      <>
                        Sent to {sendResult.sent}/{sendResult.total} recipients.
                        {sendResult.failed > 0 && (
                          <span className="text-yellow-600">
                            ({sendResult.failed} failed)
                          </span>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4" />
                    {sendResult.errors?.[0]?.error || "Failed to send. Please try again."}
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── WhatsApp Message History ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            WhatsApp Message History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No WhatsApp messages sent yet. Compose your first message above.
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
                      <h3 className="font-semibold text-sm truncate">
                        {msg.mode === "template" ? (
                          <>📋 {msg.templateName}</>
                        ) : (
                          <>💬 {(msg.text || "").slice(0, 60)}{(msg.text || "").length > 60 ? "…" : ""}</>
                        )}
                      </h3>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {audienceLabel(msg)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-xs shrink-0 ${
                          msg.mode === "template"
                            ? "border-green-300 text-green-700"
                            : "border-blue-300 text-blue-700"
                        }`}
                      >
                        {msg.mode}
                      </Badge>
                    </div>
                    {msg.text && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{msg.text}</p>
                    )}
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
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs font-medium text-green-600">
                      {msg.sent}/{msg.total_recipients} sent
                    </span>
                    {msg.failed > 0 && (
                      <span className="text-xs text-red-500">{msg.failed} failed</span>
                    )}
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
