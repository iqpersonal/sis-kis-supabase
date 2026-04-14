"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { ROLES, MAJOR_SCOPED_ROLES, type Role } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Shield, Trash2, UserPlus, Upload, FileSpreadsheet, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase";
import { useAcademicYear } from "@/context/academic-year-context";

interface AdminUser {
  uid: string;
  email?: string;
  displayName?: string;
  role: Role;
  grade?: string;
  createdAt?: string;
  assigned_major?: string;
  supervised_classes?: string[];
  supervised_subjects?: string[];
  teaches?: boolean;
}

interface CsvRow {
  SCHOOLYEAR: string;
  ROLE: string;
  FIRSTNAME: string;
  MIDDLENAME: string;
  LASTNAME: string;
  GRADE: string;
  USERNAME: string;
  PASSWORD: string;
  PRIMARYEMAIL: string;
}

interface UploadResult {
  email: string;
  name: string;
  status: "created" | "updated" | "error";
  message?: string;
}

const CSV_ROLE_LABELS: Record<string, string> = {
  T: "Teacher",
  A: "Super Admin",
  AC: "Academic Coordinator",
  F: "Finance Officer",
  ACC: "Accounts Department",
  R: "Registrar",
  V: "Viewer",
};

export default function UserManagementPage() {
  const { user, role, can } = useAuth();
  const { t } = useLanguage();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("viewer");
  const [newMajor, setNewMajor] = useState<string>("");
  const [newSupervisedClasses, setNewSupervisedClasses] = useState<string[]>([]);
  const [newSupervisedSubjects, setNewSupervisedSubjects] = useState<string[]>([]);
  const [newTeaches, setNewTeaches] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Classes/subjects lists for multi-select
  const { selectedYear } = useAcademicYear();
  const [availableClasses, setAvailableClasses] = useState<{classId:string;className:string;classNameAr:string;section:string;year:string;campus:string}[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<{code:string;nameEn:string;nameAr:string}[]>([]);

  const isMajorScoped = MAJOR_SCOPED_ROLES.includes(newRole);
  const needsClasses = newRole === "head_of_section" || newRole === "subject_coordinator";
  const needsSubjects = newRole === "subject_coordinator";

  // Fetch classes/subjects when major is selected
  useEffect(() => {
    if (!isMajorScoped || !newMajor) {
      setAvailableClasses([]);
      setAvailableSubjects([]);
      return;
    }
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const params = new URLSearchParams();
        if (selectedYear) params.set("year", selectedYear);
        params.set("school", newMajor);
        if (needsSubjects) params.set("subjects", "1");
        const res = await fetch(`/api/admin/users/assign-classes?${params}`, { headers });
        if (res.ok) {
          const data = await res.json();
          setAvailableClasses(data.classes || []);
          setAvailableSubjects(data.subjects || []);
        }
      } catch { /* ignore */ }
    })();
  }, [newMajor, selectedYear, isMajorScoped, needsSubjects]);

  // Reset scoping fields when role changes
  useEffect(() => {
    if (!isMajorScoped) {
      setNewMajor("");
      setNewSupervisedClasses([]);
      setNewSupervisedSubjects([]);
      setNewTeaches(false);
    }
  }, [newRole]);

  // CSV bulk upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvFileName, setCsvFileName] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResults, setUploadResults] = useState<UploadResult[] | null>(null);
  const [uploadSummary, setUploadSummary] = useState<{ total: number; created: number; updated: number; errors: number } | null>(null);



  const isSuperAdmin = role === "super_admin";

  async function getAuthHeaders() {
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }

  async function loadUsers() {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/users", { headers });
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isSuperAdmin) loadUsers();
    else setLoading(false);
  }, [isSuperAdmin]);

  // ── CSV parsing ──────────────────────────────────────────────
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    setUploadResults(null);
    setUploadSummary(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        setError("CSV file must have a header row and at least one data row");
        return;
      }

      const headers = lines[0].split(",").map((h) => h.trim().toUpperCase());
      const requiredCols = ["PRIMARYEMAIL", "PASSWORD", "FIRSTNAME", "LASTNAME", "ROLE"];
      const missing = requiredCols.filter((c) => !headers.includes(c));
      if (missing.length > 0) {
        setError(`CSV missing required columns: ${missing.join(", ")}`);
        return;
      }

      const rows: CsvRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        // Handle commas inside quoted fields
        const values: string[] = [];
        let current = "";
        let inQuotes = false;
        for (const char of lines[i]) {
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === "," && !inQuotes) {
            values.push(current.trim());
            current = "";
          } else {
            current += char;
          }
        }
        values.push(current.trim());

        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || "";
        });
        rows.push(row as unknown as CsvRow);
      }

      setCsvRows(rows);
      setError(null);
    };
    reader.readAsText(file);
  }

  async function handleBulkUpload() {
    if (csvRows.length === 0) return;
    setUploading(true);
    setUploadProgress(10);
    setError(null);
    setUploadResults(null);

    try {
      const headers = await getAuthHeaders();
      setUploadProgress(30);

      const res = await fetch("/api/admin/users/bulk-upload", {
        method: "POST",
        headers,
        body: JSON.stringify({ users: csvRows }),
      });

      setUploadProgress(90);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Upload failed");

      setUploadResults(data.results);
      setUploadSummary(data.summary);
      setUploadProgress(100);

      // Refresh user list
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function resetCsvUpload() {
    setCsvRows([]);
    setCsvFileName("");
    setUploadResults(null);
    setUploadSummary(null);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const payload: Record<string, unknown> = { email, role: newRole };
      if (isMajorScoped && newMajor) {
        payload.assigned_major = newMajor;
      }
      if (needsClasses && newSupervisedClasses.length > 0) {
        payload.supervised_classes = newSupervisedClasses;
      }
      if (needsSubjects && newSupervisedSubjects.length > 0) {
        payload.supervised_subjects = newSupervisedSubjects;
      }
      if (needsClasses) {
        payload.teaches = newTeaches;
      }
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      let msg = data.created
        ? `User ${email} assigned role ${ROLES[newRole as Role]}. Account was auto-created.`
        : `User ${email} assigned role ${ROLES[newRole as Role]}.`;
      if (data.emailSent) {
        msg += " Welcome email sent successfully.";
      } else if (data.emailError) {
        msg += ` ⚠ Email failed: ${data.emailError}`;
      }
      setSuccess(msg);
      setEmail("");
      setNewMajor("");
      setNewSupervisedClasses([]);
      setNewSupervisedSubjects([]);
      setNewTeaches(false);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateRole(uid: string, updatedRole: Role) {
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers,
        body: JSON.stringify({ uid, role: updatedRole }),
      });
      if (!res.ok) throw new Error("Failed to update role");
      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, role: updatedRole } : u))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleDelete(uid: string) {
    if (!confirm("Remove this user's admin role?")) return;
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/users?uid=${encodeURIComponent(uid)}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Failed to delete");
      setUsers((prev) => prev.filter((u) => u.uid !== uid));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Access denied. Super Admin only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          {t("navUserManagement" as never) || "User Management"}
        </h1>
        <p className="text-muted-foreground">
          {t("userMgmtDesc" as never) || "Assign roles and permissions to admin users"}
        </p>
      </div>

      {/* Add user form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5" />
            {t("addUser" as never) || "Add / Update User"}
          </CardTitle>
          <CardDescription>
            {t("addUserDesc" as never) ||
              "Enter the email of a user who has already signed up, then assign a role."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddUser} className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="text-sm font-medium mb-1 block">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                />
              </div>
              <div className="w-48">
                <label className="text-sm font-medium mb-1 block">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  {Object.entries(ROLES).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : t("save" as never) || "Save"}
              </Button>
            </div>

            {/* ── Scoping fields for major-scoped roles ── */}
            {isMajorScoped && (
              <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
                <div className="w-48">
                  <label className="text-sm font-medium mb-1 block">School Branch</label>
                  <select
                    value={newMajor}
                    onChange={(e) => {
                      setNewMajor(e.target.value);
                      setNewSupervisedClasses([]);
                      setNewSupervisedSubjects([]);
                    }}
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="">Select…</option>
                    <option value="0021-01">Boys&apos; School</option>
                    <option value="0021-02">Girls&apos; School</option>
                  </select>
                </div>

                {needsClasses && newMajor && (
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-sm font-medium mb-1 block">
                      Supervised Classes
                    </label>
                    <div className="max-h-40 overflow-y-auto rounded-md border bg-background p-2 space-y-1">
                      {availableClasses.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Loading classes…</p>
                      ) : (
                        availableClasses.map((c) => (
                          <label key={c.classId} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newSupervisedClasses.includes(c.classId)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewSupervisedClasses((prev) => [...prev, c.classId]);
                                } else {
                                  setNewSupervisedClasses((prev) => prev.filter((id) => id !== c.classId));
                                }
                              }}
                              className="rounded"
                            />
                            {c.className} – {c.section} ({c.campus})
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {needsSubjects && newMajor && (
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-sm font-medium mb-1 block">
                      Supervised Subjects
                    </label>
                    <div className="max-h-40 overflow-y-auto rounded-md border bg-background p-2 space-y-1">
                      {availableSubjects.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Loading subjects…</p>
                      ) : (
                        availableSubjects.map((s) => (
                          <label key={s.code} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newSupervisedSubjects.includes(s.code)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewSupervisedSubjects((prev) => [...prev, s.code]);
                                } else {
                                  setNewSupervisedSubjects((prev) => prev.filter((c) => c !== s.code));
                                }
                              }}
                              className="rounded"
                            />
                            {s.nameEn}
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {needsClasses && (
                  <div className="w-48">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newTeaches}
                        onChange={(e) => setNewTeaches(e.target.checked)}
                        className="rounded"
                      />
                      <span className="font-medium">Also teaches</span>
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Enable if this user is also a teacher
                    </p>
                  </div>
                )}
              </div>
            )}
          </form>
          {error && (
            <p className="mt-3 text-sm text-destructive">{error}</p>
          )}
          {success && (
            <p className="mt-3 text-sm text-green-600 dark:text-green-400">{success}</p>
          )}
        </CardContent>
      </Card>

      {/* ── CSV Bulk Upload ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="h-5 w-5" />
            {t("csvBulkUpload" as never) || "CSV Bulk Upload"}
          </CardTitle>
          <CardDescription>
            {t("csvBulkUploadDesc" as never) ||
              "Upload a CSV file to create multiple user accounts at once. Required columns: PRIMARYEMAIL, PASSWORD, FIRSTNAME, LASTNAME, ROLE."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File input + buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-4 w-4 mr-2" />
              {csvFileName || (t("chooseFile" as never) || "Choose CSV File")}
            </Button>

            {csvRows.length > 0 && !uploadResults && (
              <Button onClick={handleBulkUpload} disabled={uploading}>
                {uploading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    {t("uploading" as never) || "Uploading…"}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    {t("uploadUsers" as never) || `Upload ${csvRows.length} Users`}
                  </>
                )}
              </Button>
            )}

            {(csvRows.length > 0 || uploadResults) && (
              <Button variant="ghost" onClick={resetCsvUpload} disabled={uploading}>
                {t("clear" as never) || "Clear"}
              </Button>
            )}
          </div>

          {/* Progress bar */}
          {uploading && (
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-500 ease-out rounded-full"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}

          {/* Upload summary */}
          {uploadSummary && (
            <div className="flex flex-wrap gap-4 p-4 rounded-lg bg-muted/60">
              <div className="text-center">
                <p className="text-2xl font-bold">{uploadSummary.total}</p>
                <p className="text-xs text-muted-foreground">{t("total" as never) || "Total"}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{uploadSummary.created}</p>
                <p className="text-xs text-muted-foreground">{t("created" as never) || "Created"}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{uploadSummary.updated}</p>
                <p className="text-xs text-muted-foreground">{t("updated" as never) || "Updated"}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-destructive">{uploadSummary.errors}</p>
                <p className="text-xs text-muted-foreground">{t("errorsLabel" as never) || "Errors"}</p>
              </div>
            </div>
          )}

          {/* Upload results table */}
          {uploadResults && uploadResults.length > 0 && (
            <div className="max-h-64 overflow-y-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uploadResults.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-mono text-sm">{r.email}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>
                        {r.status === "error" ? (
                          <span className="flex items-center gap-1 text-destructive text-sm">
                            <XCircle className="h-3.5 w-3.5" />
                            {r.message}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {r.status === "created" ? "Created" : "Updated"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* CSV preview table (before upload) */}
          {csvRows.length > 0 && !uploadResults && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {t("previewRows" as never) || `Preview: ${csvRows.length} rows found`}
              </p>
              <div className="max-h-72 overflow-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Year</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvRows.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          {[row.FIRSTNAME, row.MIDDLENAME, row.LASTNAME].filter(Boolean).join(" ")}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{row.PRIMARYEMAIL}</TableCell>
                        <TableCell className="text-sm">{row.USERNAME}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {CSV_ROLE_LABELS[row.ROLE?.toUpperCase()] || row.ROLE}
                          </span>
                        </TableCell>
                        <TableCell>{row.GRADE}</TableCell>
                        <TableCell>{row.SCHOOLYEAR}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Users table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-lg">
            {t("adminUsers" as never) || "Admin Users"}
          </CardTitle>
          <Input
            placeholder="Search by email, name, or role…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-xs h-9"
          />
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground py-4">Loading…</p>
          ) : users.length === 0 ? (
            <p className="text-muted-foreground py-4">
              No admin users configured yet. Your account has Super Admin access by default.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email / UID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users
                  .filter((u) => {
                    if (!searchQuery.trim()) return true;
                    const q = searchQuery.toLowerCase();
                    const roleLabel = ROLES[u.role]?.toLowerCase() || "";
                    return (
                      (u.email || "").toLowerCase().includes(q) ||
                      (u.displayName || "").toLowerCase().includes(q) ||
                      u.role.toLowerCase().includes(q) ||
                      roleLabel.includes(q)
                    );
                  })
                  .map((u) => (
                  <TableRow key={u.uid}>
                    <TableCell className="font-mono text-sm">
                      {u.email || u.uid}
                    </TableCell>
                    <TableCell className="text-sm">
                      {u.displayName || "—"}
                    </TableCell>
                    <TableCell>
                      <select
                        value={u.role}
                        onChange={(e) =>
                          handleUpdateRole(u.uid, e.target.value as Role)
                        }
                        disabled={u.uid === user?.uid}
                        className="h-8 rounded-md border bg-background px-2 text-sm"
                      >
                        {Object.entries(ROLES).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.assigned_major === "0021-01" ? "Boys" : u.assigned_major === "0021-02" ? "Girls" : "—"}
                      {u.supervised_classes?.length ? ` · ${u.supervised_classes.length} classes` : ""}
                      {u.supervised_subjects?.length ? ` · ${u.supervised_subjects.length} subjects` : ""}
                      {u.teaches ? " · teaches" : ""}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(u.uid)}
                        disabled={u.uid === user?.uid}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
