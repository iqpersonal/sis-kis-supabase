"use client";

import { useMemo } from "react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FileDown, Printer, AlertTriangle, XCircle } from "lucide-react";
import type { StoreItem } from "@/types/sis";
import type { StoreConfig } from "@/lib/store-config";
import { exportToCSV } from "@/lib/export-csv";

/* ─── Props ───────────────────────────────────────────────────── */
interface ReorderReportProps {
  items: (StoreItem & { _store: "general" | "it" })[];
  getCfg: (s: "general" | "it") => StoreConfig;
  getCategoryLabel: (i: StoreItem & { _store: "general" | "it" }) => string;
  storeLabel: (s: "general" | "it") => string;
  showStore: boolean;
}

/* ─── Component ───────────────────────────────────────────────── */
export default function ReorderReport({ items, getCfg, getCategoryLabel, storeLabel, showStore }: ReorderReportProps) {
  // Items that need reordering: out of stock OR below reorder level
  const reorderItems = useMemo(() => {
    return items
      .filter((i) => i.quantity === 0 || (i.reorder_level > 0 && i.quantity <= i.reorder_level))
      .map((i) => ({
        ...i,
        deficit: Math.max(0, i.reorder_level - i.quantity),
        suggestedOrder: Math.max(i.reorder_level * 2, i.reorder_level - i.quantity + Math.ceil(i.reorder_level * 0.5)),
        status: i.quantity === 0 ? "out_of_stock" as const : "low_stock" as const,
      }))
      .sort((a, b) => {
        // Out of stock first, then by deficit descending
        if (a.status !== b.status) return a.status === "out_of_stock" ? -1 : 1;
        return b.deficit - a.deficit;
      });
  }, [items]);

  const outOfStockCount = reorderItems.filter((i) => i.status === "out_of_stock").length;
  const lowStockCount = reorderItems.filter((i) => i.status === "low_stock").length;

  function handleExport() {
    exportToCSV("procurement-reorder-report.csv",
      [
        ...(showStore ? ["Store"] : []),
        "Item ID", "Name", "Name (AR)", "Category", "Unit", "Current Qty",
        "Reorder Level", "Deficit", "Suggested Order", "Status", "Location",
      ],
      reorderItems.map((i) => [
        ...(showStore ? [storeLabel(i._store)] : []),
        i.item_id, i.name, i.name_ar, getCategoryLabel(i), i.unit,
        i.quantity, i.reorder_level, i.deficit, i.suggestedOrder,
        i.status === "out_of_stock" ? "OUT OF STOCK" : "LOW STOCK", i.location,
      ]),
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium text-red-700 dark:text-red-400">Out of Stock</span>
            </div>
            <div className="text-2xl font-bold text-red-600">{outOfStockCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Items with zero quantity — urgent reorder</p>
          </CardContent>
        </Card>
        <Card className="border-yellow-200 dark:border-yellow-900">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">Low Stock</span>
            </div>
            <div className="text-2xl font-bold text-yellow-600">{lowStockCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Items at or below reorder level</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium">Total Items to Reorder</span>
            </div>
            <div className="text-2xl font-bold">{reorderItems.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Combined out-of-stock + low-stock items</p>
          </CardContent>
        </Card>
      </div>

      {/* Reorder Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Procurement / Reorder List</CardTitle>
              <CardDescription>
                Items below reorder threshold. Suggested order = 2x reorder level or deficit + 50% buffer, whichever is greater.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5">
                <FileDown className="h-4 w-4" /> Export CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5">
                <Printer className="h-4 w-4" /> Print
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {reorderItems.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-2">✅</div>
              <p className="text-muted-foreground font-medium">All items are above reorder levels</p>
              <p className="text-sm text-muted-foreground">No procurement action needed at this time</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {showStore && <TableHead>Store</TableHead>}
                  <TableHead>Item ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Reorder Lvl</TableHead>
                  <TableHead className="text-right">Deficit</TableHead>
                  <TableHead className="text-right">Suggested Order</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reorderItems.map((item) => (
                  <TableRow key={item.id} className={item.status === "out_of_stock" ? "bg-red-50 dark:bg-red-950/20" : ""}>
                    {showStore && <TableCell><Badge variant="outline">{storeLabel(item._store)}</Badge></TableCell>}
                    <TableCell className="font-mono text-xs text-muted-foreground">{item.item_id}</TableCell>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      {item.name_ar && <div className="text-xs text-muted-foreground">{item.name_ar}</div>}
                    </TableCell>
                    <TableCell>{getCategoryLabel(item)}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell className="text-sm">{item.location || "—"}</TableCell>
                    <TableCell className="text-right font-semibold">
                      <span className={item.quantity === 0 ? "text-red-600" : "text-yellow-600"}>{item.quantity}</span>
                    </TableCell>
                    <TableCell className="text-right">{item.reorder_level}</TableCell>
                    <TableCell className="text-right font-semibold text-red-600">{item.deficit}</TableCell>
                    <TableCell className="text-right font-bold text-blue-600">{item.suggestedOrder}</TableCell>
                    <TableCell>
                      {item.status === "out_of_stock"
                        ? <Badge variant="destructive">Out of Stock</Badge>
                        : <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">Low Stock</Badge>}
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
