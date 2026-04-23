import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_SHORT } from "@/lib/cache-headers";
import { verifyAuth } from "@/lib/api-auth";
import { hasPermission } from "@/lib/rbac";

/**
 * Fixed Assets API — school non-IT physical assets
 *
 * GET /api/fixed-assets
 *   ?action=stats        → dashboard KPIs
 *   ?action=assets       → list all assets (optional filters: category, status, branch)
 *   ?action=asset&id=X   → single asset detail
 *   ?action=history&asset_id=X → history for an asset
 *
 * POST /api/fixed-assets
 *   { action: "create_asset", ...fields }
 *   { action: "update_asset", id, ...fields }
 *   { action: "update_status", asset_id, status, notes, performed_by }
 *   { action: "schedule_maintenance", asset_id, next_maintenance_date, maintenance_interval_days, notes, performed_by }
 *   { action: "complete_maintenance", asset_id, condition, notes, performed_by }
 *   { action: "delete_asset", id }
 */

export const dynamic = "force-dynamic";

const FA_CATEGORIES = [
  "ac",
  "furniture_classroom",
  "furniture_office",
  "electrical",
  "playground_sports",
  "safety_security",
  "laboratory",
  "kitchen_cafeteria",
  "signage",
  "vehicles",
  "other",
] as const;

const FA_CATEGORY_PREFIXES: Record<string, string> = {
  ac: "FA-AC",
  furniture_classroom: "FA-FCL",
  furniture_office: "FA-FOF",
  electrical: "FA-ELC",
  playground_sports: "FA-SPT",
  safety_security: "FA-SEC",
  laboratory: "FA-LAB",
  kitchen_cafeteria: "FA-KIT",
  signage: "FA-SGN",
  vehicles: "FA-VEH",
  other: "FA-OTH",
};

const FA_CATEGORY_LABELS: Record<string, string> = {
  ac: "Air Conditioning",
  furniture_classroom: "Furniture — Classroom",
  furniture_office: "Furniture — Office",
  electrical: "Electrical Appliances",
  playground_sports: "Playground & Sports",
  safety_security: "Safety & Security",
  laboratory: "Laboratory Equipment",
  kitchen_cafeteria: "Kitchen & Cafeteria",
  signage: "Signage & Boards",
  vehicles: "Vehicles",
  other: "Other",
};

const FA_STATUSES = ["active", "available", "maintenance", "retired", "lost"] as const;
const FA_CONDITIONS = ["excellent", "good", "fair", "poor"] as const;

// ── GET ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;

  if (!hasPermission(auth.role, "fixed_assets.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const action = req.nextUrl.searchParams.get("action") || "stats";

  try {
    // ── Stats ──
    if (action === "stats") {
      const snap = await adminDb
        .collection("fixed_assets")
        .select(
          "status",
          "category",
          "branch",
          "purchase_price",
          "purchase_date",
          "useful_life_years",
          "salvage_value",
          "next_maintenance_date",
          "warranty_expiry"
        )
        .limit(10000)
        .get();

      let total = 0, active = 0, available = 0, maintenance = 0, retired = 0, lost = 0;
      let warrantyExpiring = 0, maintenanceDue = 0;
      let totalValue = 0, totalDepreciation = 0, totalBookValue = 0;
      const byCategory: Record<string, number> = {};
      const byBranch: Record<string, number> = {};

      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      for (const doc of snap.docs) {
        const d = doc.data();
        total++;

        switch (d.status) {
          case "active": active++; break;
          case "available": available++; break;
          case "maintenance": maintenance++; break;
          case "retired": retired++; break;
          case "lost": lost++; break;
        }

        if (d.warranty_expiry) {
          const exp = new Date(d.warranty_expiry as string);
          if (exp >= now && exp <= in30) warrantyExpiring++;
        }

        if (d.next_maintenance_date) {
          const maint = new Date(d.next_maintenance_date as string);
          if (maint <= in14) maintenanceDue++;
        }

        const cat = (d.category as string) || "other";
        byCategory[cat] = (byCategory[cat] || 0) + 1;

        const branch = (d.branch as string) || "unknown";
        byBranch[branch] = (byBranch[branch] || 0) + 1;

        if (typeof d.purchase_price === "number") {
          totalValue += d.purchase_price;

          if (d.purchase_date && typeof d.useful_life_years === "number" && d.useful_life_years > 0) {
            const salvage = typeof d.salvage_value === "number" ? d.salvage_value : 0;
            const purchaseDate = new Date(d.purchase_date as string);
            const ageYears = (now.getTime() - purchaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
            const annualDep = (d.purchase_price - salvage) / d.useful_life_years;
            const accDep = Math.min(annualDep * ageYears, d.purchase_price - salvage);
            totalDepreciation += Math.max(0, accDep);
            totalBookValue += Math.max(salvage, d.purchase_price - accDep);
          } else {
            totalBookValue += d.purchase_price;
          }
        }
      }

      return NextResponse.json({
        total, active, available, maintenance, retired, lost,
        warranty_expiring: warrantyExpiring,
        maintenance_due: maintenanceDue,
        total_value: totalValue,
        total_depreciation: Math.round(totalDepreciation * 100) / 100,
        total_book_value: Math.round(totalBookValue * 100) / 100,
        by_category: byCategory,
        by_branch: byBranch,
      }, { headers: CACHE_SHORT });
    }

    // ── All assets ──
    if (action === "assets") {
      const categoryFilter = req.nextUrl.searchParams.get("category") || "";
      const statusFilter = req.nextUrl.searchParams.get("status") || "";
      const branchFilter = req.nextUrl.searchParams.get("branch") || "";

      let query: FirebaseFirestore.Query = adminDb.collection("fixed_assets");

      if (categoryFilter && FA_CATEGORIES.includes(categoryFilter as typeof FA_CATEGORIES[number])) {
        query = query.where("category", "==", categoryFilter);
      }
      if (statusFilter && FA_STATUSES.includes(statusFilter as typeof FA_STATUSES[number])) {
        query = query.where("status", "==", statusFilter);
      }
      if (branchFilter) {
        query = query.where("branch", "==", branchFilter);
      }

      const snap = await query.limit(5000).get();
      const assets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return NextResponse.json({ assets, category_labels: FA_CATEGORY_LABELS }, { headers: CACHE_SHORT });
    }

    // ── Single asset ──
    if (action === "asset") {
      const id = req.nextUrl.searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const doc = await adminDb.collection("fixed_assets").doc(id).get();
      if (!doc.exists) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      return NextResponse.json({ asset: { id: doc.id, ...doc.data() } }, { headers: CACHE_SHORT });
    }

    // ── History ──
    if (action === "history") {
      const assetId = req.nextUrl.searchParams.get("asset_id");
      if (!assetId) return NextResponse.json({ error: "asset_id required" }, { status: 400 });
      const snap = await adminDb
        .collection("fixed_asset_history")
        .where("asset_id", "==", assetId)
        .orderBy("timestamp", "desc")
        .limit(500)
        .get();
      const history = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return NextResponse.json({ history }, { headers: CACHE_SHORT });
    }

    // ── Meta (categories/statuses for frontend) ──
    if (action === "meta") {
      return NextResponse.json({
        categories: FA_CATEGORIES,
        category_labels: FA_CATEGORY_LABELS,
        category_prefixes: FA_CATEGORY_PREFIXES,
        statuses: FA_STATUSES,
        conditions: FA_CONDITIONS,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Fixed Assets GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;

  if (!hasPermission(auth.role, "fixed_assets.manage")) {
    return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // ── Create asset ──
    if (action === "create_asset") {
      const {
        category, name, name_ar, purchase_date, purchase_price,
        warranty_expiry, status, condition, location, branch, notes,
        useful_life_years, salvage_value, next_maintenance_date,
        maintenance_interval_days, department, serial_number,
      } = body;

      if (!category || !name) {
        return NextResponse.json({ error: "category and name are required" }, { status: 400 });
      }

      const prefix = FA_CATEGORY_PREFIXES[category] || "FA-OTH";

      // Count existing in same category for sequential ID
      const countSnap = await adminDb
        .collection("fixed_assets")
        .where("category", "==", category)
        .count()
        .get();
      const nextNum = countSnap.data().count + 1;
      const assetId = `${prefix}-${String(nextNum).padStart(4, "0")}`;

      const doc = {
        asset_id: assetId,
        category: category || "other",
        name: name || "",
        name_ar: name_ar || "",
        serial_number: serial_number || "",
        department: department || "",
        purchase_date: purchase_date || null,
        purchase_price: typeof purchase_price === "number" ? purchase_price : null,
        warranty_expiry: warranty_expiry || null,
        status: FA_STATUSES.includes(status) ? status : "available",
        condition: FA_CONDITIONS.includes(condition) ? condition : "good",
        location: location || "",
        branch: branch || "",
        notes: notes || "",
        useful_life_years: typeof useful_life_years === "number" ? useful_life_years : null,
        salvage_value: typeof salvage_value === "number" ? salvage_value : null,
        next_maintenance_date: next_maintenance_date || null,
        maintenance_interval_days: typeof maintenance_interval_days === "number" ? maintenance_interval_days : null,
        created_at: new Date().toISOString(),
        updated_by: body.performed_by || "system",
      };

      const ref = await adminDb.collection("fixed_assets").add(doc);

      await adminDb.collection("fixed_asset_history").add({
        asset_id: assetId,
        action: "created",
        timestamp: new Date().toISOString(),
        performed_by: body.performed_by || "system",
        notes: `Created asset ${assetId}: ${name}`,
      });

      return NextResponse.json({ id: ref.id, ...doc }, { status: 201 });
    }

    // ── Update asset ──
    if (action === "update_asset") {
      const { id, ...fields } = body;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      delete fields.action;
      fields.updated_by = body.performed_by || "system";

      const ref = adminDb.collection("fixed_assets").doc(id);
      const existing = await ref.get();
      if (!existing.exists) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

      await ref.update(fields);

      await adminDb.collection("fixed_asset_history").add({
        asset_id: existing.data()?.asset_id || id,
        action: "updated",
        timestamp: new Date().toISOString(),
        performed_by: body.performed_by || "system",
        notes: `Updated fields: ${Object.keys(fields).filter((k) => k !== "updated_by").join(", ")}`,
      });

      return NextResponse.json({ success: true });
    }

    // ── Update status ──
    if (action === "update_status") {
      const { asset_id, status, notes: statusNotes, performed_by } = body;
      if (!asset_id || !status || !FA_STATUSES.includes(status)) {
        return NextResponse.json({ error: "Valid asset_id and status required" }, { status: 400 });
      }

      const snap = await adminDb
        .collection("fixed_assets")
        .where("asset_id", "==", asset_id)
        .limit(1)
        .get();
      if (snap.empty) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

      await snap.docs[0].ref.update({ status, updated_by: performed_by || "system" });

      await adminDb.collection("fixed_asset_history").add({
        asset_id,
        action: "status_change",
        timestamp: new Date().toISOString(),
        performed_by: performed_by || "system",
        notes: statusNotes || `Status changed to ${status}`,
      });

      return NextResponse.json({ success: true });
    }

    // ── Schedule maintenance ──
    if (action === "schedule_maintenance") {
      const { asset_id, next_maintenance_date, maintenance_interval_days, notes: maintNotes, performed_by } = body;
      if (!asset_id || !next_maintenance_date) {
        return NextResponse.json({ error: "asset_id and next_maintenance_date required" }, { status: 400 });
      }

      const snap = await adminDb
        .collection("fixed_assets")
        .where("asset_id", "==", asset_id)
        .limit(1)
        .get();
      if (snap.empty) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

      const updates: Record<string, unknown> = { next_maintenance_date, updated_by: performed_by || "system" };
      if (typeof maintenance_interval_days === "number" && maintenance_interval_days > 0) {
        updates.maintenance_interval_days = maintenance_interval_days;
      }

      await snap.docs[0].ref.update(updates);

      await adminDb.collection("fixed_asset_history").add({
        asset_id,
        action: "maintenance_scheduled",
        timestamp: new Date().toISOString(),
        performed_by: performed_by || "system",
        notes: maintNotes || `Maintenance scheduled for ${next_maintenance_date}`,
      });

      return NextResponse.json({ success: true });
    }

    // ── Complete maintenance ──
    if (action === "complete_maintenance") {
      const { asset_id, condition: maintCondition, notes: maintNotes, performed_by } = body;
      if (!asset_id) return NextResponse.json({ error: "asset_id required" }, { status: 400 });

      const snap = await adminDb
        .collection("fixed_assets")
        .where("asset_id", "==", asset_id)
        .limit(1)
        .get();
      if (snap.empty) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

      const data = snap.docs[0].data();
      const updates: Record<string, unknown> = {
        status: "active",
        updated_by: performed_by || "system",
      };

      if (maintCondition && FA_CONDITIONS.includes(maintCondition)) {
        updates.condition = maintCondition;
      }

      if (typeof data.maintenance_interval_days === "number" && data.maintenance_interval_days > 0) {
        const next = new Date();
        next.setDate(next.getDate() + data.maintenance_interval_days);
        updates.next_maintenance_date = next.toISOString().split("T")[0];
      } else {
        updates.next_maintenance_date = null;
      }

      await snap.docs[0].ref.update(updates);

      await adminDb.collection("fixed_asset_history").add({
        asset_id,
        action: "maintenance_completed",
        timestamp: new Date().toISOString(),
        performed_by: performed_by || "system",
        notes: maintNotes || "Maintenance completed",
      });

      return NextResponse.json({ success: true });
    }

    // ── Delete asset ──
    if (action === "delete_asset") {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

      // Verify manage permission (already checked above, but good to be explicit)
      const doc = await adminDb.collection("fixed_assets").doc(id).get();
      if (!doc.exists) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

      // Log before delete
      await adminDb.collection("fixed_asset_history").add({
        asset_id: doc.data()?.asset_id || id,
        action: "deleted",
        timestamp: new Date().toISOString(),
        performed_by: body.performed_by || "system",
        notes: `Asset deleted`,
      });

      await adminDb.collection("fixed_assets").doc(id).delete();
      return NextResponse.json({ success: true });
    }

    // ── Bulk import ──
    if (action === "bulk_import") {
      const { assets, performed_by } = body;
      if (!Array.isArray(assets) || assets.length === 0) {
        return NextResponse.json({ error: "assets array required" }, { status: 400 });
      }

      let imported = 0;
      const batch = adminDb.batch();

      for (const item of assets) {
        if (!item.category || !item.name) continue;

        const prefix = FA_CATEGORY_PREFIXES[item.category] || "FA-OTH";
        const countSnap = await adminDb
          .collection("fixed_assets")
          .where("category", "==", item.category)
          .count()
          .get();
        const nextNum = countSnap.data().count + 1 + imported;
        const assetId = `${prefix}-${String(nextNum).padStart(4, "0")}`;

        const ref = adminDb.collection("fixed_assets").doc();
        batch.set(ref, {
          asset_id: assetId,
          category: item.category,
          name: item.name || "",
          name_ar: item.name_ar || "",
          serial_number: item.serial_number || "",
          department: item.department || "",
          purchase_date: item.purchase_date || null,
          purchase_price: item.purchase_price ? Number(item.purchase_price) : null,
          warranty_expiry: item.warranty_expiry || null,
          status: FA_STATUSES.includes(item.status) ? item.status : "available",
          condition: FA_CONDITIONS.includes(item.condition) ? item.condition : "good",
          location: item.location || "",
          branch: item.branch || "",
          notes: item.notes || "",
          useful_life_years: item.useful_life_years ? Number(item.useful_life_years) : null,
          salvage_value: item.salvage_value ? Number(item.salvage_value) : null,
          next_maintenance_date: item.next_maintenance_date || null,
          maintenance_interval_days: item.maintenance_interval_days ? Number(item.maintenance_interval_days) : null,
          created_at: new Date().toISOString(),
          updated_by: performed_by || "system",
        });
        imported++;
      }

      await batch.commit();
      return NextResponse.json({ success: true, imported });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Fixed Assets POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
