"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

/* ─── Types ─── */
interface Child {
  child_name: string;
  current_class: string;
}

interface ContactData {
  father_phone: string;
  mother_phone: string;
  father_email: string;
  mother_email: string;
  address_city: string;
  address_district: string;
  address_street: string;
  emergency_name: string;
  emergency_phone: string;
  father_workplace: string;
  mother_workplace: string;
}

interface FamilyData {
  family_number: string;
  father_name: string;
  family_name: string;
  children: Child[];
  contact: ContactData;
}

type PageState = "loading" | "invalid" | "form" | "success";
type Lang = "en" | "ar";

/* ─── Translations ─── */
const t = {
  en: {
    schoolName: "Khaled International Schools",
    pageTitle: "Update Contact Information",
    verifying: "Verifying...",
    linkInvalid: "This link is invalid",
    linkUsed: "This link has already been used",
    linkInvalidOrUsed: "This link is invalid or has been used",
    linkLocked: "Link locked due to wrong attempts",
    contactSchool: "Please contact the school administration",
    connectionFailed: "Connection failed",
    students: "Students",
    noStudents: "No students",
    fatherInfo: "Father Information",
    motherInfo: "Mother Information",
    address: "Address",
    emergency: "Emergency Contact",
    mobile: "Mobile",
    email: "Email",
    workplace: "Workplace",
    city: "City",
    district: "District",
    street: "Street",
    contactName: "Contact Name",
    emergencyPhone: "Emergency Phone",
    invalidEmail: "Invalid email",
    phoneTooShort: "Phone too short",
    failedToSave: "Failed to save",
    saving: "Saving...",
    saveUpdates: "Save Updates",
    successTitle: "Your information has been updated successfully",
    successSub: "Thank you — you may close this page",
    switchLang: "العربية",
  },
  ar: {
    schoolName: "مدارس خالد العالمية",
    pageTitle: "تحديث بيانات التواصل",
    verifying: "جاري التحقق...",
    linkInvalid: "هذا الرابط غير صالح",
    linkUsed: "تم استخدام هذا الرابط مسبقاً",
    linkInvalidOrUsed: "هذا الرابط غير صالح أو تم استخدامه",
    linkLocked: "تم قفل الرابط بسبب المحاولات الخاطئة",
    contactSchool: "يرجى التواصل مع إدارة المدرسة",
    connectionFailed: "فشل الاتصال بالخادم",
    students: "الطلاب",
    noStudents: "لا يوجد طلاب",
    fatherInfo: "بيانات الأب",
    motherInfo: "بيانات الأم",
    address: "العنوان",
    emergency: "الطوارئ",
    mobile: "رقم الجوال",
    email: "البريد الإلكتروني",
    workplace: "جهة العمل",
    city: "المدينة",
    district: "الحي",
    street: "الشارع",
    contactName: "اسم جهة الاتصال",
    emergencyPhone: "رقم الطوارئ",
    invalidEmail: "بريد إلكتروني غير صالح",
    phoneTooShort: "رقم قصير جداً",
    failedToSave: "فشل حفظ البيانات",
    saving: "جاري الحفظ...",
    saveUpdates: "حفظ التحديثات",
    successTitle: "تم تحديث بياناتكم بنجاح",
    successSub: "شكراً لكم — يمكنكم إغلاق هذه الصفحة",
    switchLang: "English",
  },
};

/* ─── Component ─── */
export default function ContactUpdatePage() {
  const { token } = useParams<{ token: string }>();
  const [lang, setLang] = useState<Lang>("en");
  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState("");
  const [family, setFamily] = useState<FamilyData | null>(null);
  const [contact, setContact] = useState<ContactData>({
    father_phone: "", mother_phone: "", father_email: "", mother_email: "",
    address_city: "", address_district: "", address_street: "",
    emergency_name: "", emergency_phone: "", father_workplace: "", mother_workplace: "",
  });

  const l = t[lang];
  const isAr = lang === "ar";

  // Form state
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  /* ── Step 1: Validate token & load form directly (no OTP) ── */
  const loadForm = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/contact-update/${token}/validate`);
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "invalid_token") { setState("invalid"); setError("invalid"); return; }
        if (data.error === "token_used") { setState("invalid"); setError("used"); return; }
        setState("invalid"); setError(data.message || "error"); return;
      }
      setFamily(data);
      setContact(data.contact);
      setState("form");
    } catch {
      setState("invalid"); setError("connection");
    }
  }, [token]);

  useEffect(() => {
    if (token) loadForm();
  }, [token, loadForm]);

  /* ── Resolve error keys to translated text ── */
  const resolveError = (key: string) => {
    if (key === "invalid") return l.linkInvalid;
    if (key === "used") return l.linkUsed;
    if (key === "locked") return l.linkLocked;
    return l.linkInvalidOrUsed;
  };

  /* ── Step 2: Submit Form ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    const errs: Record<string, string> = {};
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const f of ["father_email", "mother_email"] as const) {
      if (contact[f] && !emailRe.test(contact[f])) errs[f] = l.invalidEmail;
    }
    for (const f of ["father_phone", "mother_phone", "emergency_phone"] as const) {
      const digits = contact[f].replace(/\D/g, "");
      if (contact[f] && digits.length < 9) errs[f] = l.phoneTooShort;
    }
    if (Object.keys(errs).length > 0) { setFormErrors(errs); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/contact-update/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormErrors({ _form: data.message || l.failedToSave });
        return;
      }
      setState("success");
    } catch {
      setFormErrors({ _form: l.connectionFailed });
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = (field: keyof ContactData, value: string) => {
    setContact((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
  };

  /* ─── Render ─── */
  return (
    <div dir={isAr ? "rtl" : "ltr"} style={{ minHeight: "100vh", background: "linear-gradient(135deg, #f0f4ff 0%, #e8f5e9 100%)", fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px" }}>

        {/* Language toggle */}
        <div style={{ textAlign: isAr ? "left" : "right", marginBottom: 8 }}>
          <button
            onClick={() => setLang(isAr ? "en" : "ar")}
            style={{
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
              padding: "6px 14px", fontSize: 13, fontWeight: 600, color: "#3b82f6",
              cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,.06)",
            }}
          >
            {l.switchLang}
          </button>
        </div>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img src="/kis-logo.png" alt="KIS" style={{ height: 72, width: "auto", margin: "0 auto 8px", display: "block" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1a365d", margin: "0 0 4px" }}>{l.schoolName}</h2>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1e293b", margin: 0 }}>{l.pageTitle}</h1>
        </div>

        {/* ── Loading ── */}
        {state === "loading" && (
          <Card>
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <Spinner />
              <p style={{ marginTop: 16, color: "#64748b" }}>{l.verifying}</p>
            </div>
          </Card>
        )}

        {/* ── Invalid / Used ── */}
        {state === "invalid" && (
          <Card>
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
              <p style={{ fontSize: 16, color: "#dc2626", fontWeight: 600 }}>
                {resolveError(error)}
              </p>
              <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 12 }}>
                {l.contactSchool}
              </p>
            </div>
          </Card>
        )}



        {/* ── Contact Form ── */}
        {state === "form" && family && (
          <form onSubmit={handleSubmit}>
            <Card>
              <div style={{ marginBottom: 4 }}>
                <SectionTitle title={l.students} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {family.children.map((c, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span style={{ fontSize: 20 }}>🎓</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>{c.child_name}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{c.current_class}</div>
                      </div>
                    </div>
                  ))}
                  {family.children.length === 0 && (
                    <p style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: 8 }}>{l.noStudents}</p>
                  )}
                </div>
              </div>
            </Card>

            <Card>
              <SectionTitle title={l.fatherInfo} />
              <FormField label={l.mobile} value={contact.father_phone} onChange={(v) => updateField("father_phone", v)} type="tel" error={formErrors.father_phone} dir="ltr" />
              <FormField label={l.email} value={contact.father_email} onChange={(v) => updateField("father_email", v)} type="email" error={formErrors.father_email} dir="ltr" />
              <FormField label={l.workplace} value={contact.father_workplace} onChange={(v) => updateField("father_workplace", v)} />
            </Card>

            <Card>
              <SectionTitle title={l.motherInfo} />
              <FormField label={l.mobile} value={contact.mother_phone} onChange={(v) => updateField("mother_phone", v)} type="tel" error={formErrors.mother_phone} dir="ltr" />
              <FormField label={l.email} value={contact.mother_email} onChange={(v) => updateField("mother_email", v)} type="email" error={formErrors.mother_email} dir="ltr" />
              <FormField label={l.workplace} value={contact.mother_workplace} onChange={(v) => updateField("mother_workplace", v)} />
            </Card>

            <Card>
              <SectionTitle title={l.address} />
              <FormField label={l.city} value={contact.address_city} onChange={(v) => updateField("address_city", v)} />
              <FormField label={l.district} value={contact.address_district} onChange={(v) => updateField("address_district", v)} />
              <FormField label={l.street} value={contact.address_street} onChange={(v) => updateField("address_street", v)} />
            </Card>

            <Card>
              <SectionTitle title={l.emergency} />
              <FormField label={l.contactName} value={contact.emergency_name} onChange={(v) => updateField("emergency_name", v)} />
              <FormField label={l.emergencyPhone} value={contact.emergency_phone} onChange={(v) => updateField("emergency_phone", v)} type="tel" error={formErrors.emergency_phone} dir="ltr" />
            </Card>

            {formErrors._form && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 16px", marginBottom: 16, textAlign: "center" }}>
                <p style={{ color: "#dc2626", fontSize: 14, margin: 0 }}>{formErrors._form}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: "100%", padding: "14px 24px", fontSize: 16, fontWeight: 700,
                color: "#fff", background: submitting ? "#93c5fd" : "#2563eb",
                border: "none", borderRadius: 12, cursor: submitting ? "default" : "pointer",
                transition: "background 0.2s", marginBottom: 24,
              }}
            >
              {submitting ? l.saving : l.saveUpdates}
            </button>
          </form>
        )}

        {/* ── Success ── */}
        {state === "success" && (
          <Card>
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#16a34a", margin: "0 0 8px" }}>{l.successTitle}</h2>
              <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 16 }}>{l.successSub}</p>
            </div>
          </Card>
        )}

      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 16, boxShadow: "0 1px 8px rgba(0,0,0,.06)",
      padding: "20px 20px 16px", marginBottom: 16,
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div style={{ marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #f1f5f9" }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", margin: 0 }}>{title}</h3>
    </div>
  );
}

function FormField({
  label, value, onChange, type = "text", error, dir,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; error?: string; dir?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#475569", marginBottom: 4 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir={dir}
        style={{
          width: "100%", padding: "10px 12px", fontSize: 15,
          border: `1.5px solid ${error ? "#fca5a5" : "#e2e8f0"}`,
          borderRadius: 10, outline: "none", transition: "border-color 0.2s",
          boxSizing: "border-box", background: "#fafbfc",
        }}
        onFocus={(e) => { e.target.style.borderColor = error ? "#f87171" : "#3b82f6"; e.target.style.background = "#fff"; }}
        onBlur={(e) => { e.target.style.borderColor = error ? "#fca5a5" : "#e2e8f0"; e.target.style.background = "#fafbfc"; }}
      />
      {error && <p style={{ color: "#dc2626", fontSize: 12, margin: "4px 0 0" }}>{error}</p>}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 32, height: 32, border: "3px solid #e2e8f0", borderTopColor: "#3b82f6",
      borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto",
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
