import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_SHORT } from "@/lib/cache-headers";
import { verifyAuth } from "@/lib/api-auth";
import { hasPermission } from "@/lib/rbac";
import { GENERAL_STORE_CONFIG } from "@/lib/store-config";
import {
  getStoreStats,
  getStoreItems,
  getStoreRequests,
  getStoreTransactions,
  createItem,
  updateItem,
  deleteItem,
  bulkImportItems,
  receiveStock,
  adjustStock,
  returnStock,
  submitRequest,
  approveRequest,
  issueRequest,
  cancelRequest,
  createStockTake,
  getStockTakes,
  getStockTake,
  updateStockTakeCount,
  completeStockTake,
  cancelStockTake,
  createPurchaseOrder,
  getPurchaseOrders,
  approvePurchaseOrder,
  receivePurchaseOrder,
  transferItems,
} from "@/lib/store-api";
import { IT_STORE_CONFIG } from "@/lib/store-config";

const cfg = GENERAL_STORE_CONFIG;

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") || "stats";

  try {
    if (action === "stats") {
      const stats = await getStoreStats(adminDb, cfg);
      return NextResponse.json(stats, { headers: CACHE_SHORT });
    }

    if (action === "items") {
      const items = await getStoreItems(adminDb, cfg, {
        category: req.nextUrl.searchParams.get("category") || undefined,
        branch: req.nextUrl.searchParams.get("branch") || undefined,
      });
      return NextResponse.json({ items }, { headers: CACHE_SHORT });
    }

    if (action === "requests") {
      const limit = parseInt(req.nextUrl.searchParams.get("limit") || "500");
      const result = await getStoreRequests(adminDb, cfg, {
        status: req.nextUrl.searchParams.get("status") || undefined,
        staff: req.nextUrl.searchParams.get("staff") || undefined,
        limit,
      });
      return NextResponse.json({ requests: result.rows, hasMore: result.hasMore }, { headers: CACHE_SHORT });
    }

    if (action === "transactions") {
      const limit = parseInt(req.nextUrl.searchParams.get("limit") || "500");
      const result = await getStoreTransactions(adminDb, cfg, {
        type: req.nextUrl.searchParams.get("type") || undefined,
        item_id: req.nextUrl.searchParams.get("item_id") || undefined,
        limit,
      });
      return NextResponse.json({ transactions: result.rows, hasMore: result.hasMore }, { headers: CACHE_SHORT });
    }

    if (action === "purchase_orders") {
      const result = await getPurchaseOrders(adminDb, cfg);
      return NextResponse.json(result.data, { headers: CACHE_SHORT });
    }

    if (action === "stock_takes") {
      const result = await getStockTakes(adminDb, cfg);
      return NextResponse.json(result.data, { headers: CACHE_SHORT });
    }

    if (action === "stock_take") {
      const id = req.nextUrl.searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const result = await getStockTake(adminDb, cfg, id);
      if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json(result.data, { headers: CACHE_SHORT });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("General Store GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { action } = body;

    // Permission checks
    const MANAGE_ACTIONS = ["create_item", "update_item", "delete_item", "bulk_import", "receive_stock", "adjust_stock", "return_stock", "approve_request", "issue_request", "cancel_request", "create_stock_take", "update_stock_take_count", "complete_stock_take", "cancel_stock_take", "create_po", "approve_po", "receive_po", "transfer_out"];
    const REQUEST_ACTIONS = ["submit_request"];
    if (MANAGE_ACTIONS.includes(action) && !hasPermission(auth.role, "general_store.manage")) {
      return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
    }
    if (REQUEST_ACTIONS.includes(action) && !hasPermission(auth.role, "general_store.request")) {
      return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
    }

    const handlers: Record<string, () => Promise<{ data?: unknown; error?: string; status?: number }>> = {
      create_item: () => createItem(adminDb, cfg, body),
      update_item: () => updateItem(adminDb, cfg, body),
      delete_item: () => deleteItem(adminDb, cfg, body),
      bulk_import: () => bulkImportItems(adminDb, cfg, body),
      receive_stock: () => receiveStock(adminDb, cfg, body),
      adjust_stock: () => adjustStock(adminDb, cfg, body),
      return_stock: () => returnStock(adminDb, cfg, body),
      submit_request: () => submitRequest(adminDb, cfg, body),
      approve_request: () => approveRequest(adminDb, cfg, body),
      issue_request: () => issueRequest(adminDb, cfg, body),
      cancel_request: () => cancelRequest(adminDb, cfg, body),
      create_stock_take: () => createStockTake(adminDb, cfg, body, auth.uid),
      update_stock_take_count: () => updateStockTakeCount(adminDb, cfg, body),
      complete_stock_take: () => completeStockTake(adminDb, cfg, body, auth.uid),
      cancel_stock_take: () => cancelStockTake(adminDb, cfg, body),
      create_po: () => createPurchaseOrder(adminDb, cfg, body, auth.uid),
      approve_po: () => approvePurchaseOrder(adminDb, cfg, body, auth.uid),
      receive_po: () => receivePurchaseOrder(adminDb, cfg, body, auth.uid),
      transfer_out: () => transferItems(adminDb, cfg, IT_STORE_CONFIG, body, auth.uid),
    };

    const handler = handlers[action];
    if (!handler) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const result = await handler();
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }
    return NextResponse.json(result.data);
  } catch (err) {
    console.error("General Store POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
