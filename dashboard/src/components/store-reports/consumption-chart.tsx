"use client";

import { useMemo, useState } from "react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FileDown } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line,
} from "recharts";
import type { StoreTransaction } from "@/types/sis";
import { exportToCSV } from "@/lib/export-csv";

/* ─── Props ───────────────────────────────────────────────────── */
interface ConsumptionChartProps {
  transactions: (StoreTransaction & { _store: "general" | "it" })[];
  storeLabel: (s: "general" | "it") => string;
  showStore: boolean;
  dateFrom: string;
  dateTo: string;
}

type ViewMode = "chart" | "table";
type ChartMode = "bar" | "line";

/* ─── Component ───────────────────────────────────────────────── */
export default function ConsumptionChart({ transactions, storeLabel, showStore, dateFrom, dateTo }: ConsumptionChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("chart");
  const [chartMode, setChartMode] = useState<ChartMode>("bar");

  // Month-level aggregation
  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; issued: number; received: number; gs_issued: number; gs_received: number; it_issued: number; it_received: number }>();

    for (const t of transactions) {
      const month = t.timestamp?.slice(0, 7) || "unknown"; // "YYYY-MM"
      if (!map.has(month)) {
        map.set(month, { month, issued: 0, received: 0, gs_issued: 0, gs_received: 0, it_issued: 0, it_received: 0 });
      }
      const row = map.get(month)!;
      if (t.type === "issue") {
        row.issued += t.quantity;
        if (t._store === "general") row.gs_issued += t.quantity;
        else row.it_issued += t.quantity;
      } else {
        row.received += t.quantity;
        if (t._store === "general") row.gs_received += t.quantity;
        else row.it_received += t.quantity;
      }
    }

    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [transactions]);

  // Top consumed items by month
  const topConsumedByMonth = useMemo(() => {
    const map = new Map<string, Map<string, { name: string; store: string; qty: number }>>();

    for (const t of transactions) {
      if (t.type !== "issue") continue;
      const month = t.timestamp?.slice(0, 7) || "unknown";
      if (!map.has(month)) map.set(month, new Map());
      const monthMap = map.get(month)!;
      const key = `${t._store}:${t.item_id}`;
      if (!monthMap.has(key)) monthMap.set(key, { name: t.item_name, store: storeLabel(t._store), qty: 0 });
      monthMap.get(key)!.qty += t.quantity;
    }

    const result: { month: string; items: { name: string; store: string; qty: number }[] }[] = [];
    for (const [month, itemMap] of Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))) {
      result.push({ month, items: Array.from(itemMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 5) });
    }
    return result.slice(0, 6); // last 6 months
  }, [transactions, storeLabel]);

  const dateLabel = dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : dateFrom ? `from ${dateFrom}` : dateTo ? `until ${dateTo}` : "all time";

  function handleExport() {
    if (showStore) {
      exportToCSV("monthly-consumption.csv",
        ["Month", "GS Issued", "GS Received", "IT Issued", "IT Received", "Total Issued", "Total Received"],
        monthlyData.map((r) => [r.month, r.gs_issued, r.gs_received, r.it_issued, r.it_received, r.issued, r.received]),
      );
    } else {
      exportToCSV("monthly-consumption.csv",
        ["Month", "Issued", "Received"],
        monthlyData.map((r) => [r.month, r.issued, r.received]),
      );
    }
  }

  const ChartComponent = chartMode === "bar" ? BarChart : LineChart;

  return (
    <div className="space-y-6">
      {/* Chart / Table Toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Monthly Consumption</CardTitle>
              <CardDescription>Issue &amp; receive quantities by month — {dateLabel}</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant={viewMode === "chart" ? "default" : "outline"} onClick={() => setViewMode("chart")}>Chart</Button>
              <Button size="sm" variant={viewMode === "table" ? "default" : "outline"} onClick={() => setViewMode("table")}>Table</Button>
              {viewMode === "chart" && (
                <>
                  <Button size="sm" variant={chartMode === "bar" ? "default" : "outline"} onClick={() => setChartMode("bar")}>Bar</Button>
                  <Button size="sm" variant={chartMode === "line" ? "default" : "outline"} onClick={() => setChartMode("line")}>Line</Button>
                </>
              )}
              <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5">
                <FileDown className="h-4 w-4" /> CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {monthlyData.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">No transaction data to display</p>
          ) : viewMode === "chart" ? (
            <ResponsiveContainer width="100%" height={380}>
              {chartMode === "bar" ? (
                <BarChart data={monthlyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  {showStore ? (
                    <>
                      <Bar dataKey="gs_issued" name="GS Issued" fill="#ef4444" stackId="issued" />
                      <Bar dataKey="it_issued" name="IT Issued" fill="#f97316" stackId="issued" />
                      <Bar dataKey="gs_received" name="GS Received" fill="#22c55e" stackId="received" />
                      <Bar dataKey="it_received" name="IT Received" fill="#06b6d4" stackId="received" />
                    </>
                  ) : (
                    <>
                      <Bar dataKey="issued" name="Issued" fill="#ef4444" />
                      <Bar dataKey="received" name="Received" fill="#22c55e" />
                    </>
                  )}
                </BarChart>
              ) : (
                <LineChart data={monthlyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  {showStore ? (
                    <>
                      <Line type="monotone" dataKey="gs_issued" name="GS Issued" stroke="#ef4444" strokeWidth={2} />
                      <Line type="monotone" dataKey="it_issued" name="IT Issued" stroke="#f97316" strokeWidth={2} />
                      <Line type="monotone" dataKey="gs_received" name="GS Received" stroke="#22c55e" strokeWidth={2} />
                      <Line type="monotone" dataKey="it_received" name="IT Received" stroke="#06b6d4" strokeWidth={2} />
                    </>
                  ) : (
                    <>
                      <Line type="monotone" dataKey="issued" name="Issued" stroke="#ef4444" strokeWidth={2} />
                      <Line type="monotone" dataKey="received" name="Received" stroke="#22c55e" strokeWidth={2} />
                    </>
                  )}
                </LineChart>
              )}
            </ResponsiveContainer>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  {showStore ? (
                    <>
                      <TableHead className="text-right">GS Issued</TableHead>
                      <TableHead className="text-right">GS Received</TableHead>
                      <TableHead className="text-right">IT Issued</TableHead>
                      <TableHead className="text-right">IT Received</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className="text-right">Issued</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                    </>
                  )}
                  <TableHead className="text-right">Total Issued</TableHead>
                  <TableHead className="text-right">Total Received</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyData.map((row) => (
                  <TableRow key={row.month}>
                    <TableCell className="font-mono">{row.month}</TableCell>
                    {showStore ? (
                      <>
                        <TableCell className="text-right">{row.gs_issued.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{row.gs_received.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{row.it_issued.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{row.it_received.toLocaleString()}</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="text-right">{row.issued.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{row.received.toLocaleString()}</TableCell>
                      </>
                    )}
                    <TableCell className="text-right font-semibold text-red-600">{row.issued.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-semibold text-green-600">{row.received.toLocaleString()}</TableCell>
                    <TableCell className={`text-right font-semibold ${row.received - row.issued >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {(row.received - row.issued).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Top Consumed Items per Month */}
      {topConsumedByMonth.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Consumed Items by Month</CardTitle>
            <CardDescription>Top 5 most issued items per month (last 6 months)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {topConsumedByMonth.map((monthData) => (
                <div key={monthData.month}>
                  <h4 className="text-sm font-semibold mb-2">{monthData.month}</h4>
                  <div className="space-y-1">
                    {monthData.items.map((item, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <span className="text-muted-foreground w-4 text-right">{i + 1}.</span>
                        <span className="flex-1 truncate">{item.name}</span>
                        {showStore && <Badge variant="outline" className="text-[10px] px-1">{item.store}</Badge>}
                        <span className="font-bold tabular-nums">{item.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
