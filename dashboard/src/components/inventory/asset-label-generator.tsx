"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Printer, QrCode } from "lucide-react";
import QRCode from "qrcode";

export interface AssetLabelItem {
  /** Firestore document id */
  id: string;
  /** Value encoded in the QR code — the human-readable asset ID */
  asset_id: string;
  /** Primary display name */
  name: string;
  /** Secondary line: serial number, brand/model, or Arabic name */
  subtitle?: string;
  /** Tertiary line: location, department, assigned user */
  detail?: string;
  /** Small pill tag: branch or asset type */
  tag?: string;
}

interface AssetLabelGeneratorProps {
  items: AssetLabelItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
}

export default function AssetLabelGenerator({
  items,
  open,
  onOpenChange,
  title = "Asset Label Generator",
}: AssetLabelGeneratorProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
  const [copies, setCopies] = useState(1);
  const printRef = useRef<HTMLDivElement>(null);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setSearch("");
    }
  }, [open]);

  // Generate QR codes for selected items
  useEffect(() => {
    const generate = async () => {
      const urls: Record<string, string> = {};
      for (const id of selected) {
        if (qrUrls[id]) { urls[id] = qrUrls[id]; continue; }
        const item = items.find((i) => i.id === id);
        if (!item) continue;
        try {
          urls[id] = await QRCode.toDataURL(item.asset_id, {
            width: 130,
            margin: 1,
            color: { dark: "#000000", light: "#ffffff" },
          });
        } catch {
          // skip on error
        }
      }
      setQrUrls((prev) => ({ ...prev, ...urls }));
    };
    if (selected.size > 0) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, items]);

  const filtered = items.filter((i) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      i.asset_id.toLowerCase().includes(q) ||
      i.name.toLowerCase().includes(q) ||
      (i.subtitle ?? "").toLowerCase().includes(q) ||
      (i.detail ?? "").toLowerCase().includes(q)
    );
  });

  const toggleItem = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    selected.size === filtered.length
      ? setSelected(new Set())
      : setSelected(new Set(filtered.map((i) => i.id)));

  const handlePrint = () => {
    const selectedItems = Array.from(selected)
      .map((id) => items.find((i) => i.id === id))
      .filter(Boolean) as AssetLabelItem[];

    const labelsHtml = Array.from({ length: copies })
      .flatMap(() => selectedItems)
      .map(
        (item) => `
        <div class="label">
          <img src="${qrUrls[item.id] ?? ""}" alt="QR" width="110" height="110" />
          <div class="asset-id">${item.asset_id}</div>
          <div class="name">${item.name}</div>
          ${item.subtitle ? `<div class="subtitle">${item.subtitle}</div>` : ""}
          ${item.detail ? `<div class="detail">${item.detail}</div>` : ""}
          ${item.tag ? `<div class="tag">${item.tag}</div>` : ""}
        </div>`
      )
      .join("");

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Asset Labels — ${title}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; background: #fff; }
            .labels {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 6mm;
              padding: 8mm;
            }
            .label {
              border: 1px solid #ccc;
              border-radius: 6px;
              padding: 6px;
              text-align: center;
              page-break-inside: avoid;
              background: #fff;
            }
            .label img { display: block; margin: 0 auto 4px; }
            .asset-id {
              font-family: 'Courier New', monospace;
              font-size: 10px;
              font-weight: bold;
              color: #111;
              letter-spacing: 0.5px;
              margin-bottom: 2px;
            }
            .name {
              font-size: 10px;
              font-weight: 600;
              color: #222;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              margin-bottom: 2px;
            }
            .subtitle {
              font-family: 'Courier New', monospace;
              font-size: 8px;
              color: #555;
              margin-bottom: 1px;
            }
            .detail { font-size: 8px; color: #777; margin-bottom: 2px; }
            .tag {
              display: inline-block;
              font-size: 7px;
              color: #fff;
              background: #374151;
              border-radius: 3px;
              padding: 1px 4px;
              margin-top: 2px;
            }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="labels">${labelsHtml}</div>
          <script>window.onload = function() { window.print(); window.close(); }<\/script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const selectedItems = Array.from(selected)
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean) as AssetLabelItem[];

  const totalLabels = selectedItems.length * copies;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Select assets to generate printable QR code labels (3 per row, A4).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Search + select all */}
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search by ID, name, serial..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {selected.size === filtered.length && filtered.length > 0
                ? "Deselect All"
                : "Select All"}
            </Button>
            <Badge variant="secondary">{selected.size} selected</Badge>
          </div>

          {/* Item list */}
          <div className="max-h-52 overflow-y-auto rounded-md border divide-y">
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">No assets found.</p>
            ) : (
              filtered.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-muted cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleItem(item.id)}
                    className="rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.name}</div>
                    {item.subtitle && (
                      <div className="text-xs text-muted-foreground font-mono truncate">
                        {item.subtitle}
                      </div>
                    )}
                  </div>
                  <span className="font-mono text-xs text-muted-foreground shrink-0">
                    {item.asset_id}
                  </span>
                </label>
              ))
            )}
          </div>

          {/* Copies */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium whitespace-nowrap">Copies per label:</label>
            <Input
              type="number"
              min={1}
              max={10}
              value={copies}
              onChange={(e) =>
                setCopies(Math.max(1, Math.min(10, Number(e.target.value))))
              }
              className="w-20"
            />
          </div>
        </div>

        {/* Preview */}
        {selectedItems.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Preview — {selectedItems.length} label{selectedItems.length !== 1 ? "s" : ""} ×{" "}
              {copies} cop{copies !== 1 ? "ies" : "y"} ={" "}
              <strong>{totalLabels}</strong> total
            </h4>
            <div
              ref={printRef}
              className="flex flex-wrap gap-3 rounded-md border p-3 bg-white max-h-72 overflow-y-auto"
            >
              {selectedItems.map((item) => (
                <div
                  key={item.id}
                  className="w-[155px] shrink-0 rounded-md border border-gray-300 p-2 text-center bg-white"
                >
                  {qrUrls[item.id] ? (
                    <img
                      src={qrUrls[item.id]}
                      alt={item.asset_id}
                      className="mx-auto h-[110px] w-[110px]"
                    />
                  ) : (
                    <div className="mx-auto h-[110px] w-[110px] flex items-center justify-center text-xs text-gray-400 border border-dashed">
                      Generating…
                    </div>
                  )}
                  <p className="mt-1 font-mono text-[10px] font-bold text-black tracking-tight">
                    {item.asset_id}
                  </p>
                  <p className="text-[10px] font-semibold text-gray-800 truncate">{item.name}</p>
                  {item.subtitle && (
                    <p className="font-mono text-[8px] text-gray-500 truncate">{item.subtitle}</p>
                  )}
                  {item.detail && (
                    <p className="text-[8px] text-gray-500 truncate">{item.detail}</p>
                  )}
                  {item.tag && (
                    <span className="inline-block mt-1 rounded bg-gray-700 px-1 py-0.5 text-[7px] text-white">
                      {item.tag}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handlePrint} disabled={selectedItems.length === 0}>
            <Printer className="mr-2 h-4 w-4" />
            Print {totalLabels > 0 ? `${totalLabels} Label${totalLabels !== 1 ? "s" : ""}` : "Labels"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
