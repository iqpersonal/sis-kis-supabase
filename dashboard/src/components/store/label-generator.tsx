"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Printer, QrCode } from "lucide-react";
import type { StoreItem } from "@/types/sis";
import QRCode from "qrcode";

interface LabelGeneratorProps {
  items: StoreItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeLabel: string;
}

export default function LabelGenerator({ items, open, onOpenChange, storeLabel }: LabelGeneratorProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const printRef = useRef<HTMLDivElement>(null);

  // Generate QR codes for selected items
  useEffect(() => {
    const generate = async () => {
      const urls: Record<string, string> = {};
      for (const itemId of selected) {
        const item = items.find((i) => i.id === itemId);
        if (!item) continue;
        const value = item.barcode || item.item_id;
        try {
          urls[itemId] = await QRCode.toDataURL(value, { width: 120, margin: 1 });
        } catch {
          // skip
        }
      }
      setQrDataUrls(urls);
    };
    if (selected.size > 0) generate();
  }, [selected, items]);

  const toggleItem = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((i) => i.id)));
  };

  const filtered = items.filter((i) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return i.name.toLowerCase().includes(q) || i.item_id.toLowerCase().includes(q) || (i.barcode || "").includes(q);
  });

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>${storeLabel} Labels</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; }
            .labels { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px; }
            .label { border: 1px solid #ccc; border-radius: 6px; padding: 8px; width: 180px; text-align: center; page-break-inside: avoid; }
            .label img { display: block; margin: 4px auto; }
            .label .name { font-size: 11px; font-weight: bold; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .label .id { font-size: 9px; color: #666; font-family: monospace; }
            .label .barcode { font-size: 9px; color: #999; font-family: monospace; }
            @media print { body { -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <div class="labels">${printRef.current.innerHTML}</div>
          <script>window.onload=function(){window.print();window.close();}<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" /> QR Label Generator</DialogTitle>
          <DialogDescription>Select items to generate printable QR code labels</DialogDescription>
        </DialogHeader>

        {/* Selection */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
            <Button variant="outline" size="sm" onClick={selectAll}>
              {selected.size === filtered.length ? "Deselect All" : "Select All"}
            </Button>
            <Badge>{selected.size} selected</Badge>
          </div>

          <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
            {filtered.map((item) => (
              <label key={item.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted cursor-pointer">
                <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleItem(item.id)} className="rounded" />
                <span className="flex-1 text-sm truncate">{item.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{item.barcode || item.item_id}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Preview */}
        {selected.size > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Preview</h4>
            <div ref={printRef} className="flex flex-wrap gap-3 rounded-md border p-3 bg-white">
              {Array.from(selected).map((id) => {
                const item = items.find((i) => i.id === id);
                if (!item) return null;
                return (
                  <div key={id} className="w-[170px] rounded-md border p-2 text-center">
                    {qrDataUrls[id] && <img src={qrDataUrls[id]} alt="QR" className="mx-auto h-[100px] w-[100px]" />}
                    <p className="mt-1 truncate text-xs font-bold text-black">{item.name}</p>
                    <p className="font-mono text-[9px] text-gray-600">{item.item_id}</p>
                    {item.barcode && <p className="font-mono text-[9px] text-gray-400">{item.barcode}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handlePrint} disabled={selected.size === 0}>
            <Printer className="mr-1 h-4 w-4" /> Print Labels ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
