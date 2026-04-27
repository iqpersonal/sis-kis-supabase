import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_SHORT } from "@/lib/cache-headers";
import { verifyAuth } from "@/lib/api-auth";
import { hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const FA_CATEGORIES = ["ac","furniture_classroom","furniture_office","electrical","playground_sports","safety_security","laboratory","kitchen_cafeteria","signage","vehicles","other"] as const;
const FA_CATEGORY_PREFIXES: Record<string, string> = { ac:"FA-AC", furniture_classroom:"FA-FCL", furniture_office:"FA-FOF", electrical:"FA-ELC", playground_sports:"FA-SPT", safety_security:"FA-SEC", laboratory:"FA-LAB", kitchen_cafeteria:"FA-KIT", signage:"FA-SGN", vehicles:"FA-VEH", other:"FA-OTH" };
const FA_CATEGORY_LABELS: Record<string, string> = { ac:"Air Conditioning", furniture_classroom:"Furniture - Classroom", furniture_office:"Furniture - Office", electrical:"Electrical Appliances", playground_sports:"Playground & Sports", safety_security:"Safety & Security", laboratory:"Laboratory Equipment", kitchen_cafeteria:"Kitchen & Cafeteria", signage:"Signage & Boards", vehicles:"Vehicles", other:"Other" };
const FA_STATUSES = ["active","available","maintenance","retired","lost"] as const;
const FA_CONDITIONS = ["excellent","good","fair","poor"] as const;

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  if (!hasPermission(auth.role, "fixed_assets.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createServiceClient();
  const action = req.nextUrl.searchParams.get("action") || "stats";

  try {
    if (action === "stats") {
      const { data: rows } = await supabase.from("fixed_assets").select("status, category, branch, purchase_price, purchase_date, useful_life_years, salvage_value, next_maintenance_date, warranty_expiry").limit(10000);
      let total = 0, active = 0, available = 0, maintenance = 0, retired = 0, lost = 0, warrantyExpiring = 0, maintenanceDue = 0, totalValue = 0, totalDepreciation = 0, totalBookValue = 0;
      const byCategory: Record<string, number> = {}, byBranch: Record<string, number> = {};
      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      for (const d of rows ?? []) {
        const row = d as Record<string, unknown>;
        total++;
        switch (row.status) { case "active": active++; break; case "available": available++; break; case "maintenance": maintenance++; break; case "retired": retired++; break; case "lost": lost++; break; }
        if (row.warranty_expiry) { const exp = new Date(row.warranty_expiry as string); if (exp >= now && exp <= in30) warrantyExpiring++; }
        if (row.next_maintenance_date) { const maint = new Date(row.next_maintenance_date as string); if (maint <= in14) maintenanceDue++; }
        byCategory[(row.category as string) || "other"] = (byCategory[(row.category as string) || "other"] || 0) + 1;
        byBranch[(row.branch as string) || "unknown"] = (byBranch[(row.branch as string) || "unknown"] || 0) + 1;
        if (typeof row.purchase_price === "number") {
          totalValue += row.purchase_price;
          if (row.purchase_date && typeof row.useful_life_years === "number" && row.useful_life_years > 0) {
            const salvage = typeof row.salvage_value === "number" ? row.salvage_value : 0;
            const ageYears = (now.getTime() - new Date(row.purchase_date as string).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
            const annualDep = (row.purchase_price - salvage) / row.useful_life_years;
            const accDep = Math.min(annualDep * ageYears, row.purchase_price - salvage);
            totalDepreciation += Math.max(0, accDep);
            totalBookValue += Math.max(salvage, row.purchase_price - accDep);
          } else { totalBookValue += row.purchase_price; }
        }
      }
      return NextResponse.json({ total, active, available, maintenance, retired, lost, warranty_expiring: warrantyExpiring, maintenance_due: maintenanceDue, total_value: totalValue, total_depreciation: Math.round(totalDepreciation * 100) / 100, total_book_value: Math.round(totalBookValue * 100) / 100, by_category: byCategory, by_branch: byBranch }, { headers: CACHE_SHORT });
    }

    if (action === "assets") {
      const categoryFilter = req.nextUrl.searchParams.get("category") || "";
      const statusFilter = req.nextUrl.searchParams.get("status") || "";
      const branchFilter = req.nextUrl.searchParams.get("branch") || "";
      let q = supabase.from("fixed_assets").select("*").limit(5000);
      if (categoryFilter && FA_CATEGORIES.includes(categoryFilter as typeof FA_CATEGORIES[number])) q = q.eq("category", categoryFilter);
      if (statusFilter && FA_STATUSES.includes(statusFilter as typeof FA_STATUSES[number])) q = q.eq("status", statusFilter);
      if (branchFilter) q = q.eq("branch", branchFilter);
      const { data: assets } = await q;
      return NextResponse.json({ assets: assets ?? [], category_labels: FA_CATEGORY_LABELS }, { headers: CACHE_SHORT });
    }

    if (action === "asset") {
      const id = req.nextUrl.searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { data } = await supabase.from("fixed_assets").select("*").eq("id", id).maybeSingle();
      if (!data) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      return NextResponse.json({ asset: data }, { headers: CACHE_SHORT });
    }

    if (action === "history") {
      const assetId = req.nextUrl.searchParams.get("asset_id");
      if (!assetId) return NextResponse.json({ error: "asset_id required" }, { status: 400 });
      const { data } = await supabase.from("fixed_asset_history").select("*").eq("asset_id", assetId).order("timestamp", { ascending: false }).limit(500);
      return NextResponse.json({ history: data ?? [] }, { headers: CACHE_SHORT });
    }

    if (action === "meta") return NextResponse.json({ categories: FA_CATEGORIES, category_labels: FA_CATEGORY_LABELS, category_prefixes: FA_CATEGORY_PREFIXES, statuses: FA_STATUSES, conditions: FA_CONDITIONS });

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Fixed Assets GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  if (!hasPermission(auth.role, "fixed_assets.manage")) return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });

  const supabase = createServiceClient();
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "create_asset") {
      const { category, name, name_ar, purchase_date, purchase_price, warranty_expiry, status, condition, location, branch, notes, useful_life_years, salvage_value, next_maintenance_date, maintenance_interval_days, department, serial_number } = body;
      if (!category || !name) return NextResponse.json({ error: "category and name are required" }, { status: 400 });
      const prefix = FA_CATEGORY_PREFIXES[category] || "FA-OTH";
      const { count } = await supabase.from("fixed_assets").select("id", { count: "exact", head: true }).eq("category", category);
      const assetId = `${prefix}-${String((count ?? 0) + 1).padStart(4, "0")}`;
      const doc = { asset_id: assetId, category: category || "other", name: name || "", name_ar: name_ar || "", serial_number: serial_number || "", department: department || "", purchase_date: purchase_date || null, purchase_price: typeof purchase_price === "number" ? purchase_price : null, warranty_expiry: warranty_expiry || null, status: FA_STATUSES.includes(status) ? status : "available", condition: FA_CONDITIONS.includes(condition) ? condition : "good", location: location || "", branch: branch || "", notes: notes || "", useful_life_years: typeof useful_life_years === "number" ? useful_life_years : null, salvage_value: typeof salvage_value === "number" ? salvage_value : null, next_maintenance_date: next_maintenance_date || null, maintenance_interval_days: typeof maintenance_interval_days === "number" ? maintenance_interval_days : null, created_at: new Date().toISOString(), updated_by: body.performed_by || "system" };
      const { data: newRow } = await supabase.from("fixed_assets").insert(doc).select("id").single();
      await supabase.from("fixed_asset_history").insert({ asset_id: assetId, action: "created", timestamp: new Date().toISOString(), performed_by: body.performed_by || "system", notes: `Created asset ${assetId}: ${name}` });
      return NextResponse.json({ id: (newRow as Record<string, unknown> | null)?.id, ...doc }, { status: 201 });
    }

    if (action === "update_asset") {
      const { id, ...fields } = body;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      delete fields.action;
      fields.updated_by = body.performed_by || "system";
      delete fields.performed_by;
      const { data: existing } = await supabase.from("fixed_assets").select("id, asset_id").eq("id", id as string).maybeSingle();
      if (!existing) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      await supabase.from("fixed_assets").update(fields).eq("id", id as string);
      await supabase.from("fixed_asset_history").insert({ asset_id: (existing as Record<string, unknown>).asset_id || id, action: "updated", timestamp: new Date().toISOString(), performed_by: body.performed_by || "system", notes: `Updated fields: ${Object.keys(fields).filter((k) => k !== "updated_by").join(", ")}` });
      return NextResponse.json({ success: true });
    }

    if (action === "update_status") {
      const { asset_id, status, notes: statusNotes, performed_by } = body;
      if (!asset_id || !status || !FA_STATUSES.includes(status)) return NextResponse.json({ error: "Valid asset_id and status required" }, { status: 400 });
      const { data: row } = await supabase.from("fixed_assets").select("id").eq("asset_id", String(asset_id)).maybeSingle();
      if (!row) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      await supabase.from("fixed_assets").update({ status, updated_by: performed_by || "system" }).eq("asset_id", String(asset_id));
      await supabase.from("fixed_asset_history").insert({ asset_id, action: "status_change", timestamp: new Date().toISOString(), performed_by: performed_by || "system", notes: statusNotes || `Status changed to ${status}` });
      return NextResponse.json({ success: true });
    }

    if (action === "schedule_maintenance") {
      const { asset_id, next_maintenance_date, maintenance_interval_days, notes: maintNotes, performed_by } = body;
      if (!asset_id || !next_maintenance_date) return NextResponse.json({ error: "asset_id and next_maintenance_date required" }, { status: 400 });
      const { data: row } = await supabase.from("fixed_assets").select("id").eq("asset_id", String(asset_id)).maybeSingle();
      if (!row) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      const updates: Record<string, unknown> = { next_maintenance_date, updated_by: performed_by || "system" };
      if (typeof maintenance_interval_days === "number" && maintenance_interval_days > 0) updates.maintenance_interval_days = maintenance_interval_days;
      await supabase.from("fixed_assets").update(updates).eq("asset_id", String(asset_id));
      await supabase.from("fixed_asset_history").insert({ asset_id, action: "maintenance_scheduled", timestamp: new Date().toISOString(), performed_by: performed_by || "system", notes: maintNotes || `Maintenance scheduled for ${next_maintenance_date}` });
      return NextResponse.json({ success: true });
    }

    if (action === "complete_maintenance") {
      const { asset_id, condition: maintCondition, notes: maintNotes, performed_by } = body;
      if (!asset_id) return NextResponse.json({ error: "asset_id required" }, { status: 400 });
      const { data: row } = await supabase.from("fixed_assets").select("*").eq("asset_id", String(asset_id)).maybeSingle();
      if (!row) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      const rowData = row as Record<string, unknown>;
      const updates: Record<string, unknown> = { status: "active", updated_by: performed_by || "system" };
      if (maintCondition && FA_CONDITIONS.includes(maintCondition)) updates.condition = maintCondition;
      if (typeof rowData.maintenance_interval_days === "number" && rowData.maintenance_interval_days > 0) { const next = new Date(); next.setDate(next.getDate() + rowData.maintenance_interval_days); updates.next_maintenance_date = next.toISOString().split("T")[0]; } else { updates.next_maintenance_date = null; }
      await supabase.from("fixed_assets").update(updates).eq("asset_id", String(asset_id));
      await supabase.from("fixed_asset_history").insert({ asset_id, action: "maintenance_completed", timestamp: new Date().toISOString(), performed_by: performed_by || "system", notes: maintNotes || "Maintenance completed" });
      return NextResponse.json({ success: true });
    }

    if (action === "delete_asset") {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { data: existing } = await supabase.from("fixed_assets").select("id, asset_id").eq("id", id as string).maybeSingle();
      if (!existing) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      await supabase.from("fixed_asset_history").insert({ asset_id: (existing as Record<string, unknown>).asset_id || id, action: "deleted", timestamp: new Date().toISOString(), performed_by: body.performed_by || "system", notes: "Asset deleted" });
      await supabase.from("fixed_assets").delete().eq("id", id as string);
      return NextResponse.json({ success: true });
    }

    if (action === "bulk_import") {
      const { assets, performed_by } = body;
      if (!Array.isArray(assets) || assets.length === 0) return NextResponse.json({ error: "assets array required" }, { status: 400 });
      let imported = 0;
      for (const item of assets) {
        if (!item.category || !item.name) continue;
        const prefix = FA_CATEGORY_PREFIXES[item.category] || "FA-OTH";
        const { count } = await supabase.from("fixed_assets").select("id", { count: "exact", head: true }).eq("category", item.category);
        const assetId = `${prefix}-${String((count ?? 0) + 1 + imported).padStart(4, "0")}`;
        await supabase.from("fixed_assets").insert({ asset_id: assetId, category: item.category, name: item.name || "", name_ar: item.name_ar || "", serial_number: item.serial_number || "", department: item.department || "", purchase_date: item.purchase_date || null, purchase_price: item.purchase_price ? Number(item.purchase_price) : null, warranty_expiry: item.warranty_expiry || null, status: FA_STATUSES.includes(item.status) ? item.status : "available", condition: FA_CONDITIONS.includes(item.condition) ? item.condition : "good", location: item.location || "", branch: item.branch || "", notes: item.notes || "", useful_life_years: item.useful_life_years ? Number(item.useful_life_years) : null, salvage_value: item.salvage_value ? Number(item.salvage_value) : null, next_maintenance_date: item.next_maintenance_date || null, maintenance_interval_days: item.maintenance_interval_days ? Number(item.maintenance_interval_days) : null, created_at: new Date().toISOString(), updated_by: performed_by || "system" });
        imported++;
      }
      return NextResponse.json({ success: true, imported });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Fixed Assets POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
