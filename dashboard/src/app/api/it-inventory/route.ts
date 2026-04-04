import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { CACHE_SHORT } from "@/lib/cache-headers";
import { verifyAuth } from "@/lib/api-auth";

/**
 * IT Inventory API
 *
 * GET /api/it-inventory
 *   ?action=stats        → dashboard KPIs
 *   ?action=assets       → list all assets (with optional filters)
 *   ?action=asset&id=X   → single asset detail
 *   ?action=history&asset_id=X → history for an asset
 *   ?action=staff-assets&staff_number=X → assets for a staff member
 *
 * POST /api/it-inventory
 *   { action: "create_asset", ...fields }
 *   { action: "update_asset", id, ...fields }
 *   { action: "assign_asset", asset_id, staff_number, staff_name, performed_by }
 *   { action: "return_asset", asset_id, condition, notes, performed_by }
 *   { action: "update_status", asset_id, status, notes, performed_by }
 *   { action: "delete_asset", id }
 *   { action: "bulk_import", assets: [...] }
 */

const ASSET_TYPES = ["laptop", "desktop", "printer", "projector", "tablet", "phone", "network_device", "monitor", "other"];
const ASSET_STATUSES = ["active", "available", "maintenance", "retired", "lost"];
const ASSET_CONDITIONS = ["excellent", "good", "fair", "poor"];

// ── GET ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") || "stats";

  try {
    // ── Stats ──
    if (action === "stats") {
      const coll = adminDb.collection("it_assets");

      // Use .select() to read only the fields we need (saves bandwidth & cost)
      const assetsSnap = await coll
        .select("status", "asset_type", "branch", "purchase_price", "warranty_expiry")
        .limit(10000)
        .get();

      let total = 0, active = 0, available = 0, maintenance = 0, retired = 0, lost = 0;
      let warrantyExpiring = 0, totalValue = 0;
      const byType: Record<string, number> = {};
      const byBranch: Record<string, number> = {};

      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      for (const doc of assetsSnap.docs) {
        const d = doc.data();
        total++;

        // Status counts
        switch (d.status) {
          case "active": active++; break;
          case "available": available++; break;
          case "maintenance": maintenance++; break;
          case "retired": retired++; break;
          case "lost": lost++; break;
        }

        // Warranty expiring within 30 days
        if (d.warranty_expiry) {
          const exp = new Date(d.warranty_expiry as string);
          if (exp >= now && exp <= in30) warrantyExpiring++;
        }

        // By type & branch
        const t = (d.asset_type as string) || "other";
        byType[t] = (byType[t] || 0) + 1;
        const b = (d.branch as string) || "unknown";
        byBranch[b] = (byBranch[b] || 0) + 1;

        // Total value
        if (typeof d.purchase_price === "number") totalValue += d.purchase_price;
      }

      return NextResponse.json({
        total,
        active,
        available,
        maintenance,
        retired,
        lost,
        warranty_expiring: warrantyExpiring,
        by_type: byType,
        by_branch: byBranch,
        total_value: totalValue,
      }, { headers: CACHE_SHORT });
    }

    // ── All assets ──
    if (action === "assets") {
      const typeFilter = req.nextUrl.searchParams.get("type");
      const statusFilter = req.nextUrl.searchParams.get("status");
      const branchFilter = req.nextUrl.searchParams.get("branch");

      let query: FirebaseFirestore.Query = adminDb.collection("it_assets");

      if (typeFilter && ASSET_TYPES.includes(typeFilter)) {
        query = query.where("asset_type", "==", typeFilter);
      }
      if (statusFilter && ASSET_STATUSES.includes(statusFilter)) {
        query = query.where("status", "==", statusFilter);
      }
      if (branchFilter) {
        query = query.where("branch", "==", branchFilter);
      }

      const snap = await query.limit(5000).get();
      const assets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return NextResponse.json({ assets }, { headers: CACHE_SHORT });
    }

    // ── Single asset ──
    if (action === "asset") {
      const id = req.nextUrl.searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "id required" }, { status: 400 });
      }
      const doc = await adminDb.collection("it_assets").doc(id).get();
      if (!doc.exists) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }
      return NextResponse.json({ asset: { id: doc.id, ...doc.data() } }, { headers: CACHE_SHORT });
    }

    // ── Asset history ──
    if (action === "history") {
      const assetId = req.nextUrl.searchParams.get("asset_id");
      if (!assetId) {
        return NextResponse.json({ error: "asset_id required" }, { status: 400 });
      }
      const snap = await adminDb
        .collection("it_asset_history")
        .where("asset_id", "==", assetId)
        .orderBy("timestamp", "desc")
        .limit(1000)
        .get();
      const history = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return NextResponse.json({ history }, { headers: CACHE_SHORT });
    }

    // ── Staff assets ──
    if (action === "staff-assets") {
      const staffNumber = req.nextUrl.searchParams.get("staff_number");
      if (!staffNumber) {
        return NextResponse.json({ error: "staff_number required" }, { status: 400 });
      }
      const snap = await adminDb
        .collection("it_assets")
        .where("assigned_to", "==", staffNumber)
        .limit(500)
        .get();
      const assets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return NextResponse.json({ assets }, { headers: CACHE_SHORT });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("IT Inventory GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { action } = body;

    // ── Create asset ──
    if (action === "create_asset") {
      const { asset_type, brand, model, serial_number, purchase_date, purchase_price,
        warranty_expiry, status, condition, location, branch, notes, specs } = body;

      if (!asset_type || !brand || !model || !serial_number) {
        return NextResponse.json(
          { error: "asset_type, brand, model, and serial_number are required" },
          { status: 400 }
        );
      }

      // Generate asset_id: KIS-{TYPE_PREFIX}-{NNNN}
      const prefix = asset_type === "laptop" ? "LT" : asset_type === "desktop" ? "DT" :
        asset_type === "printer" ? "PR" : asset_type === "projector" ? "PJ" :
        asset_type === "tablet" ? "TB" : asset_type === "phone" ? "PH" :
        asset_type === "network_device" ? "ND" : asset_type === "monitor" ? "MN" : "OT";

      const countSnap = await adminDb
        .collection("it_assets")
        .where("asset_type", "==", asset_type)
        .count()
        .get();
      const nextNum = countSnap.data().count + 1;
      const assetId = `KIS-${prefix}-${String(nextNum).padStart(4, "0")}`;

      const doc = {
        asset_id: assetId,
        asset_type,
        brand: brand || "",
        model: model || "",
        serial_number: serial_number || "",
        purchase_date: purchase_date || null,
        purchase_price: typeof purchase_price === "number" ? purchase_price : null,
        warranty_expiry: warranty_expiry || null,
        status: ASSET_STATUSES.includes(status) ? status : "available",
        condition: ASSET_CONDITIONS.includes(condition) ? condition : "good",
        location: location || "",
        branch: branch || "",
        assigned_to: null,
        assigned_to_name: null,
        assigned_date: null,
        notes: notes || "",
        specs: specs || {},
        created_at: new Date().toISOString(),
        updated_by: body.performed_by || "system",
      };

      const ref = await adminDb.collection("it_assets").add(doc);

      // Log history
      await adminDb.collection("it_asset_history").add({
        asset_id: assetId,
        action: "created",
        from_staff: null,
        to_staff: null,
        timestamp: new Date().toISOString(),
        performed_by: body.performed_by || "system",
        notes: `Created asset ${assetId}: ${brand} ${model}`,
      });

      return NextResponse.json({ id: ref.id, ...doc });
    }

    // ── Update asset ──
    if (action === "update_asset") {
      const { id, ...fields } = body;
      if (!id) {
        return NextResponse.json({ error: "id required" }, { status: 400 });
      }
      delete fields.action;
      fields.updated_by = body.performed_by || "system";

      const ref = adminDb.collection("it_assets").doc(id);
      const existing = await ref.get();
      if (!existing.exists) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }

      await ref.update(fields);
      const data = existing.data();

      await adminDb.collection("it_asset_history").add({
        asset_id: data?.asset_id || id,
        action: "updated",
        from_staff: null,
        to_staff: null,
        timestamp: new Date().toISOString(),
        performed_by: body.performed_by || "system",
        notes: `Updated asset fields: ${Object.keys(fields).join(", ")}`,
      });

      return NextResponse.json({ success: true });
    }

    // ── Assign asset ──
    if (action === "assign_asset") {
      const { asset_id, staff_number, staff_name, performed_by } = body;
      if (!asset_id || !staff_number) {
        return NextResponse.json(
          { error: "asset_id and staff_number required" },
          { status: 400 }
        );
      }

      // Find the asset doc by asset_id field
      const snap = await adminDb
        .collection("it_assets")
        .where("asset_id", "==", asset_id)
        .limit(1)
        .get();

      if (snap.empty) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }

      const docRef = snap.docs[0].ref;
      const prevData = snap.docs[0].data();

      await docRef.update({
        assigned_to: staff_number,
        assigned_to_name: staff_name || null,
        assigned_date: new Date().toISOString(),
        status: "active",
      });

      await adminDb.collection("it_asset_history").add({
        asset_id,
        action: "assigned",
        from_staff: prevData.assigned_to || null,
        to_staff: staff_number,
        timestamp: new Date().toISOString(),
        performed_by: performed_by || "system",
        notes: `Assigned to ${staff_name || staff_number}`,
      });

      return NextResponse.json({ success: true });
    }

    // ── Return asset ──
    if (action === "return_asset") {
      const { asset_id, condition: returnCondition, notes: returnNotes, performed_by } = body;
      if (!asset_id) {
        return NextResponse.json({ error: "asset_id required" }, { status: 400 });
      }

      const snap = await adminDb
        .collection("it_assets")
        .where("asset_id", "==", asset_id)
        .limit(1)
        .get();

      if (snap.empty) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }

      const docRef = snap.docs[0].ref;
      const prevData = snap.docs[0].data();

      const updates: Record<string, unknown> = {
        assigned_to: null,
        assigned_to_name: null,
        assigned_date: null,
        status: "available",
      };

      if (returnCondition && ASSET_CONDITIONS.includes(returnCondition)) {
        updates.condition = returnCondition;
      }

      await docRef.update(updates);

      await adminDb.collection("it_asset_history").add({
        asset_id,
        action: "returned",
        from_staff: prevData.assigned_to || null,
        to_staff: null,
        timestamp: new Date().toISOString(),
        performed_by: performed_by || "system",
        notes: returnNotes || `Returned from ${prevData.assigned_to_name || "unknown"}`,
      });

      return NextResponse.json({ success: true });
    }

    // ── Update status ──
    if (action === "update_status") {
      const { asset_id, status, notes: statusNotes, performed_by } = body;
      if (!asset_id || !status || !ASSET_STATUSES.includes(status)) {
        return NextResponse.json({ error: "Valid asset_id and status required" }, { status: 400 });
      }

      const snap = await adminDb
        .collection("it_assets")
        .where("asset_id", "==", asset_id)
        .limit(1)
        .get();

      if (snap.empty) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }

      await snap.docs[0].ref.update({ status });

      await adminDb.collection("it_asset_history").add({
        asset_id,
        action: "status_change",
        from_staff: null,
        to_staff: null,
        timestamp: new Date().toISOString(),
        performed_by: performed_by || "system",
        notes: statusNotes || `Status changed to ${status}`,
      });

      return NextResponse.json({ success: true });
    }

    // ── Delete asset ──
    if (action === "delete_asset") {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ error: "id required" }, { status: 400 });
      }
      await adminDb.collection("it_assets").doc(id).delete();
      return NextResponse.json({ success: true });
    }

    // ── Bulk import ──
    if (action === "bulk_import") {
      const { assets, performed_by } = body;
      if (!Array.isArray(assets) || assets.length === 0) {
        return NextResponse.json({ error: "assets array required" }, { status: 400 });
      }

      let imported = 0;
      for (const item of assets) {
        if (!item.asset_type || !item.brand || !item.model || !item.serial_number) continue;

        const prefix = item.asset_type === "laptop" ? "LT" : item.asset_type === "desktop" ? "DT" :
          item.asset_type === "printer" ? "PR" : item.asset_type === "projector" ? "PJ" :
          item.asset_type === "tablet" ? "TB" : item.asset_type === "phone" ? "PH" :
          item.asset_type === "network_device" ? "ND" : item.asset_type === "monitor" ? "MN" : "OT";

        const countSnap = await adminDb
          .collection("it_assets")
          .where("asset_type", "==", item.asset_type)
          .count()
          .get();
        const nextNum = countSnap.data().count + 1;
        const assetId = `KIS-${prefix}-${String(nextNum).padStart(4, "0")}`;

        await adminDb.collection("it_assets").add({
          asset_id: assetId,
          asset_type: item.asset_type,
          brand: item.brand || "",
          model: item.model || "",
          serial_number: item.serial_number || "",
          purchase_date: item.purchase_date || null,
          purchase_price: typeof item.purchase_price === "number" ? item.purchase_price : null,
          warranty_expiry: item.warranty_expiry || null,
          status: ASSET_STATUSES.includes(item.status) ? item.status : "available",
          condition: ASSET_CONDITIONS.includes(item.condition) ? item.condition : "good",
          location: item.location || "",
          branch: item.branch || "",
          assigned_to: item.assigned_to || null,
          assigned_to_name: item.assigned_to_name || null,
          assigned_date: item.assigned_to ? new Date().toISOString() : null,
          notes: item.notes || "",
          specs: item.specs || {},
          created_at: new Date().toISOString(),
          updated_by: performed_by || "system",
        });
        imported++;
      }

      return NextResponse.json({ success: true, imported });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("IT Inventory POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
