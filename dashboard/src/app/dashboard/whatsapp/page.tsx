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
  ClipboardEdit,
  FileDown,
  Hash,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/context/auth-context";
import { useAcademicYear } from "@/context/academic-year-context";
import { getSupabase } from "@/lib/supabase";
import { useClassNames } from "@/hooks/use-classes";

/* ─── Types ─── */
interface GupshupTemplate {
  id: string;
  elementName: string;
  languageCode: string;
  category: string;
  status: string;
  data: string;
  paramCount: number;
}

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

type Audience = "all" | "school" | "class" | "family" | "manual";
type Mode = "template" | "text";
type Recipient = "father" | "mother" | "both";

const RECIPIENTS: { value: Recipient; label: string }[] = [
  { value: "father", label: "Father Only" },
  { value: "mother", label: "Mother Only" },
  { value: "both", label: "Both Parents" },
];

const AUDIENCES: { value: Audience; label: string; icon: React.ElementType }[] = [
  { value: "all", label: "All Parents", icon: Users },
  { value: "school", label: "By School", icon: School },
  { value: "class", label: "By Class", icon: BookOpen },
  { value: "family", label: "Specific Family", icon: User },
  { value: "manual", label: "Custom Numbers", icon: Hash },
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
  const [recipient, setRecipient] = useState<Recipient>("father");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    success: boolean;
    sent: number;
    failed: number;
    total: number;
    configured?: boolean;
    errors?: { phone: string; error: string }[];
  } | null>(null);

  // Template list from Gupshup
  const [templates, setTemplates] = useState<GupshupTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<GupshupTemplate | null>(null);

  // Manual numbers (custom audience)
  const [manualNumbers, setManualNumbers] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetLoading, setSheetLoading] = useState(false);

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

  // Contact Update state
  const [cuAudience, setCuAudience] = useState<"all" | "school" | "class" | "family">("all");
  const [cuSchool, setCuSchool] = useState("");
  const [cuTargets, setCuTargets] = useState<string[]>([]);
  const [cuFamilyNumber, setCuFamilyNumber] = useState("");
  const [cuRecipient, setCuRecipient] = useState<Recipient>("father");
  const [cuFamilyInfo, setCuFamilyInfo] = useState<{
    family_number: string; father_name?: string; family_name?: string;
    father_phone?: string; mother_phone?: string; father_email?: string; mother_email?: string;
    children?: { child_name: string; current_class: string; current_section?: string }[];
  } | null>(null);
  const [cuFamilyLoading, setCuFamilyLoading] = useState(false);
  const [cuSending, setCuSending] = useState(false);
  const [cuResult, setCuResult] = useState<{
    success: boolean; total_families: number; sent: number; failed: number; configured?: boolean; errors?: { phone: string; error: string }[];
  } | null>(null);
  const [cuLog, setCuLog] = useState<{ id: string; family_number: string; changed_fields: string[]; submitted_at: string }[]>([]);
  const [cuLogLoading, setCuLogLoading] = useState(false);

  /* ─── Check API configuration ─── */
  useEffect(() => {
    fetch("/api/whatsapp/status")
      .then((r) => r.json())
      .then((d) => setApiConfigured(d.configured ?? false))
      .catch(() => setApiConfigured(false));
  }, []);

  /* ─── Fetch template list ─── */
  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const r = await fetch("/api/whatsapp/templates");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      setTemplates(data.templates || []);
    } catch (err) {
      setTemplatesError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  /* ─── Parse manual numbers ─── */
  const parsedNumbers = manualNumbers
    .split(/[\n,;]+/)
    .map((s) => s.replace(/\D/g, "").trim())
    .filter((s) => s.length >= 9);

  /* ─── Import numbers from Google Sheet CSV ─── */
  const importFromSheet = async () => {
    const url = sheetUrl.trim();
    if (!url) return;
    setSheetLoading(true);
    try {
      // Convert share URL to CSV export URL
      let csvUrl = url;
      const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      const gidMatch = url.match(/[?&]gid=(\d+)/);
      if (match) {
        csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv${gidMatch ? `&gid=${gidMatch[1]}` : ""}`;
      }
      const res = await fetch(`/api/whatsapp/sheet-import?url=${encodeURIComponent(csvUrl)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const phones: string[] = data.phones || [];
      setManualNumbers((prev) => {
        const existing = prev.trim();
        return existing ? `${existing}\n${phones.join("\n")}` : phones.join("\n");
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to import from sheet");
    } finally {
      setSheetLoading(false);
    }
  };

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
        const supabase = getSupabase();
        let secQuery = supabase
          .from("sections")
          .select("Class_Code,class_code,Section_Code,section_code,Major_Code,major_code,E_Section_Name,e_section_name,Academic_Year,academic_year")
          .limit(2000);
        const yr = selectedYear || "25-26";
        secQuery = secQuery.or(`Academic_Year.eq.${yr},academic_year.eq.${yr}`);
        const { data: secRows } = await secQuery;
        if (cancelled) return;
        const items: { classCode: string; sectionCode: string; sectionName: string }[] = [];
        (secRows || []).forEach((d) => {
          const row = d as Record<string, unknown>;
          const majorCode = String(row.Major_Code || row.major_code || "");
          if (majorCode !== school) return;
          const classCode = String(row.Class_Code || row.class_code || "");
          const sectionCode = String(row.Section_Code || row.section_code || "");
          if (classCode && sectionCode && !EXCLUDED_CLASS_CODES.has(classCode)) {
            items.push({
              classCode,
              sectionCode,
              sectionName: String(row.E_Section_Name || row.e_section_name || sectionCode),
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
      const supabase = getSupabase();
      const { data: rows } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      const msgs: WhatsAppMessage[] = (rows || []).map((d) => {
        const row = d as Record<string, unknown>;
        return {
          id: String(row.id || ""),
          mode: String(row.mode || "template"),
          templateName: row.templateName != null ? String(row.templateName) : null,
          text: row.text != null ? String(row.text) : null,
          audience: String(row.audience || "all"),
          audience_filter: (row.audience_filter as Record<string, string>) || {},
          sender: String(row.sender || ""),
          total_recipients: Number(row.total_recipients) || 0,
          sent: Number(row.sent) || 0,
          failed: Number(row.failed) || 0,
          created_at: row.created_at ? new Date(String(row.created_at)) : null,
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
    if (audience === "manual") audienceFilter.phones = parsedNumbers;
    audienceFilter.recipient = recipient;

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
          templateId: mode === "template" ? selectedTemplate?.id : undefined,
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
        setSelectedTemplate(null);
        setTemplateSearch("");
        setTemplateParams("");
        setText("");
        setAudience("all");
        setSchool("");
        setSelectedTargets([]);
        setFamilyNumber("");
        setManualNumbers("");
        setSheetUrl("");
        setRecipient("father");
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
      case "manual":
        return `Custom (${msg.total_recipients} numbers)`;
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
    (audience !== "family" || familyNumber.trim()) &&
    (audience !== "manual" || parsedNumbers.length > 0);

  /* ─── Contact Update: Family lookup ─── */
  useEffect(() => {
    const fn = cuFamilyNumber.trim();
    if (!fn || cuAudience !== "family") { setCuFamilyInfo(null); return; }
    setCuFamilyLoading(true);
    const timer = setTimeout(async () => {
      try {
        const supabase = getSupabase();
        const { data: famRows } = await supabase
          .from("families")
          .select("family_number,father_name,family_name,father_phone,mother_phone,father_email,mother_email,children")
          .eq("family_number", fn)
          .limit(1);
        if (!famRows || famRows.length === 0) { setCuFamilyInfo(null); } else {
          const d = famRows[0] as Record<string, unknown>;
          setCuFamilyInfo({
            family_number: String(d.family_number || ""),
            father_name: String(d.father_name || ""),
            family_name: String(d.family_name || ""),
            father_phone: String(d.father_phone || ""),
            mother_phone: String(d.mother_phone || ""),
            father_email: String(d.father_email || ""),
            mother_email: String(d.mother_email || ""),
            children: Array.isArray(d.children) ? d.children : [],
          });
        }
      } catch { setCuFamilyInfo(null); }
      finally { setCuFamilyLoading(false); }
    }, 500);
    return () => clearTimeout(timer);
  }, [cuFamilyNumber, cuAudience]);

  /* ─── Contact Update: Send ─── */
  const handleContactUpdateSend = useCallback(async () => {
    if (!user?.email) return;
    setCuSending(true);
    setCuResult(null);
    try {
      const filter: Record<string, unknown> = {};
      if (cuAudience === "school" && cuSchool) filter.school = cuSchool;
      if (cuAudience === "class" && cuSchool) {
        filter.school = cuSchool;
        filter.targets = cuTargets.map((t) => {
          const [cls, sec] = t.split("-");
          return sec ? { class: cls, section: sec } : { class: cls };
        });
      }
      if (cuAudience === "family") filter.family_number = cuFamilyNumber.trim();
      filter.recipient = cuRecipient;
      const res = await fetch("/api/contact-update/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience: cuAudience, audience_filter: filter, sender: user.email }),
      });
      const data = await res.json();
      setCuResult(res.ok ? data : { success: false, total_families: 0, sent: 0, failed: 0 });
    } catch {
      setCuResult({ success: false, total_families: 0, sent: 0, failed: 0 });
    } finally {
      setCuSending(false);
    }
  }, [user, cuAudience, cuSchool, cuTargets, cuFamilyNumber, cuRecipient]);

  /* ─── Contact Update: Load recent submissions ─── */
  const loadContactUpdateLog = useCallback(async () => {
    setCuLogLoading(true);
    try {
      const supabase = getSupabase();
      const { data: logRows } = await supabase
        .from("contact_updates")
        .select("id,family_number,changed_fields,submitted_at")
        .order("submitted_at", { ascending: false })
        .limit(50);
      setCuLog((logRows || []) as { id: string; family_number: string; changed_fields: string[]; submitted_at: string }[]);
    } catch (err) {
      console.error("Failed to load contact update log:", err);
    } finally {
      setCuLogLoading(false);
    }
  }, []);

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
              The dashboard is ready. Once you provide the Gupshup API credentials, add
              <code className="mx-1 px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded text-[11px]">GUPSHUP_API_KEY</code>
              and
              <code className="mx-1 px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded text-[11px]">GUPSHUP_SOURCE_PHONE</code>
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
              {/* Template picker */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">Template</label>
                  <button
                    onClick={fetchTemplates}
                    disabled={templatesLoading}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw className={`h-3 w-3 ${templatesLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                </div>

                {templatesError && (
                  <p className="text-xs text-red-500 mb-1">{templatesError}</p>
                )}

                {/* Selected template display */}
                {selectedTemplate ? (
                  <div className="rounded-md border bg-muted/40 p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold font-mono">{selectedTemplate.elementName}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{selectedTemplate.languageCode} · {selectedTemplate.category}</span>
                        {selectedTemplate.paramCount > 0 && (
                          <span className="rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs px-2 py-0.5">
                            {selectedTemplate.paramCount} param{selectedTemplate.paramCount > 1 ? "s" : ""}
                          </span>
                        )}
                        <button
                          onClick={() => { setSelectedTemplate(null); setTemplateName(""); setLanguageCode("ar"); }}
                          className="text-xs text-muted-foreground hover:text-red-500"
                        >✕ Change</button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{selectedTemplate.data}</p>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      placeholder={templatesLoading ? "Loading templates…" : "Search or type template name…"}
                      value={templateSearch}
                      onChange={(e) => { setTemplateSearch(e.target.value); setTemplateName(e.target.value); setShowTemplatePicker(true); }}
                      onFocus={() => setShowTemplatePicker(true)}
                    />
                    {showTemplatePicker && templates.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-72 overflow-y-auto">
                        {templates
                          .filter((t) => !templateSearch || t.elementName.toLowerCase().includes(templateSearch.toLowerCase()) || t.data.toLowerCase().includes(templateSearch.toLowerCase()))
                          .map((t) => (
                            <button
                              key={t.id}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setSelectedTemplate(t);
                                setTemplateName(t.elementName);
                                setLanguageCode(t.languageCode || "ar");
                                setTemplateSearch("");
                                setShowTemplatePicker(false);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b last:border-0"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-mono font-medium">{t.elementName}</span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-xs text-muted-foreground">{t.languageCode}</span>
                                  {t.paramCount > 0 && (
                                    <span className="rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs px-1.5 py-0.5">
                                      {t.paramCount}p
                                    </span>
                                  )}
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.data}</p>
                            </button>
                          ))}
                        {templates.filter((t) => !templateSearch || t.elementName.toLowerCase().includes(templateSearch.toLowerCase()) || t.data.toLowerCase().includes(templateSearch.toLowerCase())).length === 0 && (
                          <p className="text-sm text-muted-foreground p-3">No templates match &quot;{templateSearch}&quot;</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Template params — only shown if template has params */}
              {(selectedTemplate?.paramCount ?? 0) > 0 && (
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Template Parameters
                    <span className="text-muted-foreground ml-1">(comma-separated, {selectedTemplate!.paramCount} required)</span>
                  </label>
                  <Input
                    placeholder={Array.from({ length: selectedTemplate!.paramCount }, (_, i) => `param${i + 1}`).join(", ")}
                    value={templateParams}
                    onChange={(e) => setTemplateParams(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    These fill the {`{{1}}, {{2}}`}, … placeholders in the template body.
                  </p>
                </div>
              )}
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

          {/* Custom / Manual numbers */}
          {audience === "manual" && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Phone Numbers</label>
                <textarea
                  className="w-full min-h-[140px] rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                  placeholder={`Paste numbers, one per line or comma-separated:\n966501234567\n966559876543\n+966 55 111 2222`}
                  value={manualNumbers}
                  onChange={(e) => setManualNumbers(e.target.value)}
                />
                {parsedNumbers.length > 0 && (
                  <p className="text-xs text-green-600 mt-1">
                    ✓ {parsedNumbers.length} valid number{parsedNumbers.length !== 1 ? "s" : ""} detected
                  </p>
                )}
              </div>

              {/* Google Sheets import */}
              <div className="rounded-md border p-3 space-y-2 bg-muted/30">
                <p className="text-xs font-medium">Import from Google Sheet</p>
                <p className="text-xs text-muted-foreground">
                  Share the sheet with &quot;Anyone with the link&quot; (view only), then paste the URL below.
                  Any column containing phone numbers will be imported automatically.
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://docs.google.com/spreadsheets/d/…"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    className="text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={importFromSheet}
                    disabled={sheetLoading || !sheetUrl.trim()}
                    className="shrink-0 gap-1"
                  >
                    {sheetLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
                    Import
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Recipient selector — hidden for manual audience (numbers are already explicit) */}
          {audience !== "manual" && (
            <div>
              <label className="text-sm font-medium mb-2 block">Recipient Phone</label>
              <div className="flex gap-2">
                {RECIPIENTS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setRecipient(value)}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                      recipient === value
                        ? "border-green-600 bg-green-600/10 text-green-700"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
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

      {/* ── Contact Update Request ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardEdit className="h-5 w-5 text-blue-600" />
            Contact Update Request
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Send parents a WhatsApp link to update their contact information (phone, email, address, etc.)
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Audience picker */}
          <div>
            <label className="text-sm font-medium mb-2 block">Audience</label>
            <div className="flex gap-2 flex-wrap">
              {(["all", "school", "class", "family"] as const).map((a) => (
                <Button key={a} size="sm" variant={cuAudience === a ? "default" : "outline"} onClick={() => { setCuAudience(a); setCuResult(null); }}>
                  {a === "all" ? "All Parents" : a === "school" ? "By School" : a === "class" ? "By Class" : "Specific Family"}
                </Button>
              ))}
            </div>
          </div>

          {cuAudience === "family" && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Family Number</label>
                <input
                  type="text"
                  value={cuFamilyNumber}
                  onChange={(e) => setCuFamilyNumber(e.target.value)}
                  placeholder="e.g. 12345"
                  className="border rounded-md px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {cuFamilyLoading && <p className="text-xs text-muted-foreground">Looking up family...</p>}
              {!cuFamilyLoading && cuFamilyNumber.trim() && !cuFamilyInfo && (
                <p className="text-xs text-red-600">Family not found</p>
              )}
              {cuFamilyInfo && (
                <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1.5">
                  <div className="font-medium">{cuFamilyInfo.father_name} {cuFamilyInfo.family_name}</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {cuFamilyInfo.father_phone && <span>Father Phone: {cuFamilyInfo.father_phone}</span>}
                    {cuFamilyInfo.mother_phone && <span>Mother Phone: {cuFamilyInfo.mother_phone}</span>}
                    {cuFamilyInfo.father_email && <span>Father Email: {cuFamilyInfo.father_email}</span>}
                    {cuFamilyInfo.mother_email && <span>Mother Email: {cuFamilyInfo.mother_email}</span>}
                  </div>
                  {cuFamilyInfo.children && cuFamilyInfo.children.length > 0 && (
                    <div className="pt-1">
                      <span className="text-xs font-medium">Children:</span>
                      <ul className="text-xs text-muted-foreground ml-3 list-disc">
                        {cuFamilyInfo.children.map((c, i) => (
                          <li key={i}>{c.child_name} — {classNameMap[c.current_class] || c.current_class}{c.current_section ? ` / ${c.current_section}` : ""}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {(cuAudience === "school" || cuAudience === "class") && (
            <div>
              <label className="text-sm font-medium mb-1 block">School</label>
              <div className="flex gap-2">
                <Button size="sm" variant={cuSchool === "0021-01" ? "default" : "outline"} onClick={() => { setCuSchool("0021-01"); setCuTargets([]); }}>Boys</Button>
                <Button size="sm" variant={cuSchool === "0021-02" ? "default" : "outline"} onClick={() => { setCuSchool("0021-02"); setCuTargets([]); }}>Girls</Button>
              </div>
            </div>
          )}

          {cuAudience === "class" && cuSchool && classSections.length > 0 && (
            <div>
              <label className="text-sm font-medium mb-1 block">Classes</label>
              <div className="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto">
                {classSections
                  .filter((cs) => !EXCLUDED_CLASS_CODES.has(cs.classCode))
                  .map((cs) => {
                    const key = cs.sectionCode ? `${cs.classCode}-${cs.sectionCode}` : cs.classCode;
                    const selected = cuTargets.includes(key);
                    return (
                      <Button key={key} size="sm" variant={selected ? "default" : "outline"} className="text-xs h-7"
                        onClick={() => setCuTargets((prev) => selected ? prev.filter((t) => t !== key) : [...prev, key])}>
                        {classNameMap[cs.classCode] || cs.classCode}{cs.sectionCode ? ` - ${cs.sectionName}` : ""}
                        {selected && <Check className="h-3 w-3 ml-1" />}
                      </Button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Recipient selector */}
          <div>
            <label className="text-sm font-medium mb-2 block">Send To Phone</label>
            <div className="flex gap-2">
              {RECIPIENTS.map(({ value, label }) => (
                <Button key={value} size="sm" variant={cuRecipient === value ? "default" : "outline"} onClick={() => setCuRecipient(value)}>
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Send button */}
          <Button onClick={handleContactUpdateSend} disabled={cuSending || (cuAudience === "family" && !cuFamilyNumber.trim()) || (cuAudience !== "all" && cuAudience !== "family" && !cuSchool) || (cuAudience === "class" && cuTargets.length === 0)} className="gap-2">
            {cuSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {cuSending ? "Sending..." : "Send Contact Update Request"}
          </Button>

          {/* Result */}
          {cuResult && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${cuResult.success ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"}`}>
              {cuResult.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {cuResult.success
                ? cuResult.failed > 0
                  ? `Sent to ${cuResult.sent} phone(s) across ${cuResult.total_families} families (${cuResult.failed} failed${cuResult.errors?.[0]?.error ? `: ${cuResult.errors[0].error}` : ""})`
                  : `Sent to ${cuResult.sent} phone(s) across ${cuResult.total_families} families`
                : "Failed to send. Check console for details."}
              {cuResult.success && !cuResult.configured && (
                <span className="text-xs ml-2">(API not configured — recorded only)</span>
              )}
            </div>
          )}

          <Separator />

          {/* Recent submissions log */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Recent Contact Updates</h4>
              <Button size="sm" variant="ghost" onClick={loadContactUpdateLog} disabled={cuLogLoading} className="gap-1 text-xs">
                {cuLogLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
                Load Log
              </Button>
            </div>
            {cuLog.length > 0 ? (
              <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                {cuLog.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-2 text-xs p-2 bg-muted/50 rounded">
                    <span className="font-mono">{entry.family_number}</span>
                    <span className="text-muted-foreground">{entry.changed_fields?.length || 0} field(s) changed</span>
                    <span className="text-muted-foreground">{entry.submitted_at?.slice(0, 16).replace("T", " ")}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">
                {cuLogLoading ? "Loading..." : "Click \"Load Log\" to see recent submissions"}
              </p>
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
