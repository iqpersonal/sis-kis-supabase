import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_SHORT } from "@/lib/cache-headers";
import { verifyAuth } from "@/lib/api-auth";
import { hasPermission } from "@/lib/rbac";
import { IT_STORE_CONFIG } from "@/lib/store-config";
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
  submitRequest,
  approveRequest,
  issueRequest,
  cancelRequest,
} from "@/lib/store-api";

const cfg = IT_STORE_CONFIG;

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

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("IT Store GET error:", err);
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
    const MANAGE_ACTIONS = ["create_item", "update_item", "delete_item", "bulk_import", "receive_stock", "approve_request", "issue_request", "cancel_request"];
    const REQUEST_ACTIONS = ["submit_request"];
    if (MANAGE_ACTIONS.includes(action) && !hasPermission(auth.role, "it_store.manage")) {
      return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
    }
    if (REQUEST_ACTIONS.includes(action) && !hasPermission(auth.role, "it_store.request")) {
      return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
    }

    const handlers: Record<string, () => Promise<{ data?: unknown; error?: string; status?: number }>> = {
      create_item: () => createItem(adminDb, cfg, body),
      update_item: () => updateItem(adminDb, cfg, body),
      delete_item: () => deleteItem(adminDb, cfg, body),
      bulk_import: () => bulkImportItems(adminDb, cfg, body),
      receive_stock: () => receiveStock(adminDb, cfg, body),
      submit_request: () => submitRequest(adminDb, cfg, body),
      approve_request: () => approveRequest(adminDb, cfg, body),
      issue_request: () => issueRequest(adminDb, cfg, body),
      cancel_request: () => cancelRequest(adminDb, cfg, body),
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
    console.error("IT Store POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
