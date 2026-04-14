import { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  getCountFromServer,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { normalizeBarcode } from "@/lib/barcode-lookup";
import type { StoreItem, StoreRequest, StoreTransaction } from "@/types/store";
import type { StoreConfig } from "@/lib/store-config";

/* ── Store Items (real-time) ─────────────────────────────────────── */

interface UseStoreItemsOpts {
  categoryFilter?: string;
  searchText?: string;
}

export function useStoreItems(config: StoreConfig, opts: UseStoreItemsOpts = {}) {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const constraints: QueryConstraint[] = [];
    if (opts.categoryFilter) {
      constraints.push(where("category", "==", opts.categoryFilter));
    }
    constraints.push(orderBy("name"));
    constraints.push(limit(1000));

    const q = query(collection(db, config.collections.items), ...constraints);
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: StoreItem[] = [];
        snap.forEach((d) => {
          const data = d.data();
          list.push({ id: d.id, ...data } as StoreItem);
        });
        // Client-side text filtering (Firestore doesn't support full-text search)
        if (opts.searchText) {
          const s = opts.searchText.toLowerCase();
          setItems(list.filter((i) =>
            i.name.toLowerCase().includes(s) ||
            i.item_id.toLowerCase().includes(s) ||
            (i.barcode && i.barcode.toLowerCase().includes(s))
          ));
        } else {
          setItems(list);
        }
        setLoading(false);
        setError("");
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return unsub;
  }, [config.collections.items, opts.categoryFilter, opts.searchText]);

  return { items, loading, error };
}

/* ── Store Stats (computed from items) ───────────────────────────── */

export interface StoreStats {
  totalItems: number;
  totalQuantity: number;
  lowStock: number;
  outOfStock: number;
  pendingRequests: number;
}

export function useStoreStats(config: StoreConfig) {
  const [stats, setStats] = useState<StoreStats>({
    totalItems: 0,
    totalQuantity: 0,
    lowStock: 0,
    outOfStock: 0,
    pendingRequests: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, config.collections.items));
    const unsub = onSnapshot(q, async (snap) => {
      let total = 0;
      let qty = 0;
      let low = 0;
      let out = 0;
      snap.forEach((d) => {
        const data = d.data();
        if (!data.is_active) return;
        total++;
        qty += data.quantity || 0;
        if (data.quantity === 0) out++;
        else if (data.quantity <= (data.reorder_level || 0)) low++;
      });

      // Count pending requests
      let pending = 0;
      try {
        const rq = query(
          collection(db, config.collections.requests),
          where("status", "==", "pending")
        );
        const rSnap = await getCountFromServer(rq);
        pending = rSnap.data().count;
      } catch { /* ignore */ }

      setStats({ totalItems: total, totalQuantity: qty, lowStock: low, outOfStock: out, pendingRequests: pending });
      setLoading(false);
    });
    return unsub;
  }, [config.collections.items, config.collections.requests]);

  return { stats, loading };
}

/* ── Store Requests (real-time) ──────────────────────────────────── */

export function useStoreRequests(config: StoreConfig, statusFilter?: string) {
  const [requests, setRequests] = useState<StoreRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const constraints: QueryConstraint[] = [];
    if (statusFilter) {
      constraints.push(where("status", "==", statusFilter));
    }
    constraints.push(orderBy("requested_at", "desc"));
    constraints.push(limit(200));

    const q = query(collection(db, config.collections.requests), ...constraints);
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: StoreRequest[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as StoreRequest));
        setRequests(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [config.collections.requests, statusFilter]);

  return { requests, loading };
}

/* ── Item Transactions (for item detail) ─────────────────────────── */

export function useItemTransactions(config: StoreConfig, itemId: string | undefined) {
  const [transactions, setTransactions] = useState<StoreTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!itemId) {
      setTransactions([]);
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, config.collections.transactions),
      where("item_id", "==", itemId),
      orderBy("timestamp", "desc"),
      limit(10)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: StoreTransaction[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as StoreTransaction));
        setTransactions(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [config.collections.transactions, itemId]);

  return { transactions, loading };
}

/* ── Find item by barcode / item_id (for scanner) ───────────────── */

export function useBarcodeSearch() {
  const [searching, setSearching] = useState(false);

  const searchByBarcode = useCallback(
    async (collectionName: string, barcode: string): Promise<StoreItem | null> => {
      const trimmed = barcode.trim();
      if (!trimmed) return null;
      const normalized = normalizeBarcode(trimmed);
      setSearching(true);
      try {
        // Try barcode field (exact match)
        try {
          const q = query(
            collection(db, collectionName),
            where("barcode", "==", trimmed),
            limit(1)
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            const d = snap.docs[0];
            return { id: d.id, ...d.data() } as StoreItem;
          }
        } catch (e) {
          console.warn("Barcode query failed, trying fallback:", e);
        }

        // Try item_id field (for QR codes encoding item IDs)
        try {
          const q = query(
            collection(db, collectionName),
            where("item_id", "==", trimmed),
            limit(1)
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            const d = snap.docs[0];
            return { id: d.id, ...d.data() } as StoreItem;
          }
        } catch (e) {
          console.warn("item_id query failed, trying fallback:", e);
        }

        // Client-side: fetch items and compare with normalized barcodes
        // This handles UPC-A vs EAN-13 mismatches (leading zero diff)
        try {
          const q = query(collection(db, collectionName), limit(500));
          const snap = await getDocs(q);
          for (const d of snap.docs) {
            const data = d.data();
            const storedNorm = data.barcode ? normalizeBarcode(data.barcode) : "";
            const idNorm = data.item_id ? normalizeBarcode(data.item_id) : "";
            if (
              storedNorm === normalized ||
              idNorm === normalized ||
              data.barcode === trimmed ||
              data.item_id === trimmed
            ) {
              return { id: d.id, ...data } as StoreItem;
            }
          }
        } catch (e) {
          console.warn("Fallback fetch failed:", e);
        }

        return null;
      } finally {
        setSearching(false);
      }
    },
    []
  );

  return { searchByBarcode, searching };
}
