"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, ChevronDown, Search, Filter } from "lucide-react";

interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  details: string;
  targetId?: string;
  targetType?: string;
  timestamp: string;
  ip?: string;
}

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  update: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  delete: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  approve: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  reject: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  login: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};

function getActionColor(action: string): string {
  const verb = action.split(".").pop() || "";
  return ACTION_COLORS[verb] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
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
  return new Date(iso).toLocaleDateString();
}

export default function AuditLogPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastId, setLastId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionFilter, setActionFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const fetchLogs = useCallback(
    async (append = false, cursor?: string) => {
      if (!user) return;
      append ? setLoadingMore(true) : setLoading(true);

      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams({ limit: "50" });
        if (actionFilter) params.set("action", actionFilter);
        if (cursor) params.set("startAfter", cursor);

        const res = await fetch(`/api/admin/audit-log?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();

        const newEntries: AuditEntry[] = data.entries;
        setEntries((prev) => (append ? [...prev, ...newEntries] : newEntries));
        setHasMore(newEntries.length === 50);
        if (newEntries.length > 0) setLastId(newEntries[newEntries.length - 1].id);
      } catch {
        /* ignore */
      } finally {
        append ? setLoadingMore(false) : setLoading(false);
      }
    },
    [user, actionFilter],
  );

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Get unique action types for filter dropdown
  const actionTypes = Array.from(new Set(entries.map((e) => e.action))).sort();

  // Client-side search filter
  const filtered = searchTerm
    ? entries.filter(
        (e) =>
          e.actor.toLowerCase().includes(searchTerm.toLowerCase()) ||
          e.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (e.targetId || "").toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : entries;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-10 w-full" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-6 w-6 text-blue-600" />
          Audit Log
        </h1>
        <p className="text-muted-foreground mt-1">
          Track all administrative actions performed in the system
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by actor, details, or target..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setEntries([]);
              setLastId(null);
            }}
            className="pl-10 pr-8 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none min-w-[180px]"
          >
            <option value="">All Actions</option>
            {actionTypes.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Entries */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
            {actionFilter && ` for "${actionFilter}"`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No audit log entries found
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((entry) => (
                <div
                  key={entry.id}
                  className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getActionColor(entry.action)}`}
                      >
                        {entry.action}
                      </span>
                      <span className="text-sm font-medium truncate">
                        {entry.actor}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {entry.details}
                    </p>
                    {entry.targetId && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Target: {entry.targetType ? `${entry.targetType} ` : ""}
                        <span className="font-mono">{entry.targetId}</span>
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap sm:text-right">
                    <div>{timeAgo(entry.timestamp)}</div>
                    <div className="text-[10px]">
                      {new Date(entry.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Load More */}
          {hasMore && !searchTerm && (
            <div className="p-4 text-center border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchLogs(true, lastId || undefined)}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading..." : "Load More"}
                <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
