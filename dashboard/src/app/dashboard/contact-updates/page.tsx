"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ClipboardEdit,
  Download,
  Loader2,
  Search,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { getSupabase } from "@/lib/supabase";

/* ─── Types ─── */
interface ContactUpdate {
  id: string;
  family_number: string;
  token: string;
  old_values: Record<string, string>;
  new_values: Record<string, string>;
  changed_fields: string[];
  submitted_at: string;
  verified_phone: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  father_phone: "Father Phone",
  mother_phone: "Mother Phone",
  father_email: "Father Email",
  mother_email: "Mother Email",
  address_city: "City",
  address_district: "District",
  address_street: "Street",
  emergency_name: "Emergency Contact Name",
  emergency_phone: "Emergency Phone",
  father_workplace: "Father Workplace",
  mother_workplace: "Mother Workplace",
};

/* ─── Page ─── */
export default function ContactUpdatesPage() {
  const [updates, setUpdates] = useState<ContactUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [maxResults, setMaxResults] = useState(200);

  /* ─── Load data ─── */
  const loadUpdates = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabase();
      const { data: rows } = await supabase
        .from("contact_updates")
        .select("id,family_number,token,old_values,new_values,changed_fields,submitted_at,verified_phone")
        .order("submitted_at", { ascending: false })
        .limit(maxResults);
      const items: ContactUpdate[] = (rows || []).map((d) => {
        const row = d as Record<string, unknown>;
        return {
          id: String(row.id || ""),
          family_number: String(row.family_number || ""),
          token: String(row.token || ""),
          old_values: (row.old_values as Record<string, string>) || {},
          new_values: (row.new_values as Record<string, string>) || {},
          changed_fields: Array.isArray(row.changed_fields) ? row.changed_fields as string[] : [],
          submitted_at: String(row.submitted_at || ""),
          verified_phone: row.verified_phone !== false,
        };
      });
      setUpdates(items);
    } catch (err) {
      console.error("Failed to load contact updates:", err);
    }
    setLoading(false);
  }, [maxResults]);

  useEffect(() => {
    loadUpdates();
  }, [loadUpdates]);

  /* ─── Filter ─── */
  const filtered = updates.filter((u) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      u.family_number.toLowerCase().includes(term) ||
      u.changed_fields.some((f) =>
        (FIELD_LABELS[f] || f).toLowerCase().includes(term)
      ) ||
      Object.values(u.new_values).some((v) =>
        v.toLowerCase().includes(term)
      )
    );
  });

  /* ─── CSV Download ─── */
  const downloadCSV = () => {
    const allFields = Object.keys(FIELD_LABELS);
    const headers = [
      "Family Number",
      "Submitted At",
      "Changed Fields",
      ...allFields.flatMap((f) => [
        `${FIELD_LABELS[f]} (Old)`,
        `${FIELD_LABELS[f]} (New)`,
      ]),
    ];

    const rows = filtered.map((u) => {
      const row: string[] = [
        u.family_number,
        u.submitted_at ? u.submitted_at.replace("T", " ").slice(0, 19) : "",
        u.changed_fields.map((f) => FIELD_LABELS[f] || f).join("; "),
      ];
      for (const f of allFields) {
        row.push(u.old_values[f] || "");
        row.push(u.new_values[f] || "");
      }
      return row;
    });

    const csvContent = [
      headers.map(escapeCsvField).join(","),
      ...rows.map((r) => r.map(escapeCsvField).join(",")),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contact_updates_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardEdit className="h-6 w-6 text-blue-600" />
            Contact Updates
          </h1>
          <p className="text-muted-foreground mt-1">
            View all submitted contact information updates from parents.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadUpdates}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadCSV}
            disabled={filtered.length === 0}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Download CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{updates.length}</div>
            <p className="text-xs text-muted-foreground">Total Submissions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">
              {new Set(updates.map((u) => u.family_number)).size}
            </div>
            <p className="text-xs text-muted-foreground">Unique Families</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">
              {updates.reduce((s, u) => s + u.changed_fields.length, 0)}
            </div>
            <p className="text-xs text-muted-foreground">Fields Updated</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">
              {updates.filter(
                (u) =>
                  u.changed_fields.includes("father_phone") ||
                  u.changed_fields.includes("mother_phone")
              ).length}
            </div>
            <p className="text-xs text-muted-foreground">Phone Updates</p>
          </CardContent>
        </Card>
      </div>

      {/* Search + Count */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Submissions</CardTitle>
            <div className="flex items-center gap-3">
              <select
                value={maxResults}
                onChange={(e) => setMaxResults(Number(e.target.value))}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              >
                <option value={100}>Last 100</option>
                <option value={200}>Last 200</option>
                <option value={500}>Last 500</option>
                <option value={2000}>Last 2000</option>
              </select>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search family #, field, or value..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-8 w-64 text-sm"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading submissions...
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {updates.length === 0
                ? "No contact updates have been submitted yet."
                : "No results match your search."}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-3">
                Showing {filtered.length} of {updates.length} submission(s)
              </p>
              {filtered.map((u) => {
                const isExpanded = expandedId === u.id;
                return (
                  <div
                    key={u.id}
                    className="border rounded-lg overflow-hidden"
                  >
                    {/* Row header */}
                    <button
                      onClick={() =>
                        setExpandedId(isExpanded ? null : u.id)
                      }
                      className="w-full flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-sm font-medium shrink-0">
                          {u.family_number}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {u.changed_fields.map((f) => (
                            <Badge
                              key={f}
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {FIELD_LABELS[f] || f}
                            </Badge>
                          ))}
                          {u.changed_fields.length === 0 && (
                            <span className="text-xs text-muted-foreground italic">
                              No changes
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {u.submitted_at
                            ? formatDate(u.submitted_at)
                            : "—"}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t px-4 py-3 bg-muted/30">
                        {u.changed_fields.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">
                            Parent submitted the form without making any
                            changes.
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-muted-foreground border-b">
                                  <th className="text-left py-1.5 pr-4 font-medium">
                                    Field
                                  </th>
                                  <th className="text-left py-1.5 pr-4 font-medium">
                                    Old Value
                                  </th>
                                  <th className="text-left py-1.5 font-medium">
                                    New Value
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {u.changed_fields.map((f) => (
                                  <tr
                                    key={f}
                                    className="border-b last:border-0"
                                  >
                                    <td className="py-1.5 pr-4 font-medium text-xs">
                                      {FIELD_LABELS[f] || f}
                                    </td>
                                    <td className="py-1.5 pr-4 text-red-600 dark:text-red-400 text-xs">
                                      {u.old_values[f] || (
                                        <span className="italic text-muted-foreground">
                                          empty
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-1.5 text-green-600 dark:text-green-400 text-xs">
                                      {u.new_values[f] || (
                                        <span className="italic text-muted-foreground">
                                          empty
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* All current values */}
                        <Separator className="my-3" />
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                            All submitted values
                          </summary>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 mt-2">
                            {Object.entries(u.new_values)
                              .filter(([, v]) => v)
                              .map(([k, v]) => (
                                <div key={k}>
                                  <span className="text-muted-foreground">
                                    {FIELD_LABELS[k] || k}:
                                  </span>{" "}
                                  <span className="font-medium">{v}</span>
                                </div>
                              ))}
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Helpers ─── */

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

function escapeCsvField(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n")
  ) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
