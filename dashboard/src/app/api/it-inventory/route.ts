import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_SHORT } from "@/lib/cache-headers";
import { verifyAuth } from "@/lib/api-auth";
import { hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const ASSET_TYPES = ["laptop","desktop","printer","projector","tablet","phone","network_device","monitor","other"];
const ASSET_STATUSES = ["active","available","maintenance","retired","lost"];
const ASSET_CONDITIONS = ["excellent","good","fair","poor"];

const TYPE_PREFIX: Record<string,string> = { laptop:"LT", desktop:"DT", printer:"PR", projector:"PJ", tablet:"TB", phone:"PH", network_device:"ND", monitor:"MN", other:"OT" };

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") || "stats";
  const supabase = createServiceClient();

  try {
    if (action === "stats") {
      const { data: rows } = await supabase.from("it_assets").select("status, asset_type, branch, purchase_price, warranty_expiry, purchase_date, useful_life_years, salvage_value, next_maintenance_date").limit(10000);
      let total=0, active=0, available=0, maintenance=0, retired=0, lost=0, warrantyExpiring=0, maintenanceDue=0, totalValue=0, totalDepreciation=0, totalBookValue=0;
      const byType: Record<string,number>={}, byBranch: Record<string,number>={};
      const now = new Date();
      const in30 = new Date(now.getTime() + 30*24*60*60*1000);
      const in14 = new Date(now.getTime() + 14*24*60*60*1000);
      for (const d of rows ?? []) {
        const row = d as Record<string,unknown>;
        total++;
        switch (row.status) { case "active": active++; break; case "available": available++; break; case "maintenance": maintenance++; break; case "retired": retired++; break; case "lost": lost++; break; }
        if (row.warranty_expiry) { const exp=new Date(row.warranty_expiry as string); if (exp>=now && exp<=in30) warrantyExpiring++; }
        if (row.next_maintenance_date) { const m=new Date(row.next_maintenance_date as string); if (m<=in14) maintenanceDue++; }
        byType[(row.asset_type as string)||"other"] = (byType[(row.asset_type as string)||"other"]||0)+1;
        byBranch[(row.branch as string)||"unknown"] = (byBranch[(row.branch as string)||"unknown"]||0)+1;
        if (typeof row.purchase_price==="number") {
          totalValue+=row.purchase_price;
          if (row.purchase_date && typeof row.useful_life_years==="number" && row.useful_life_years>0) {
            const salvage = typeof row.salvage_value==="number" ? row.salvage_value : 0;
            const ageYears=(now.getTime()-new Date(row.purchase_date as string).getTime())/(365.25*24*60*60*1000);
            const annualDep=(row.purchase_price-salvage)/row.useful_life_years;
            const accDep=Math.min(annualDep*ageYears,row.purchase_price-salvage);
            totalDepreciation+=Math.max(0,accDep);
            totalBookValue+=Math.max(salvage,row.purchase_price-accDep);
          } else { totalBookValue+=row.purchase_price; }
        }
      }
      return NextResponse.json({ total, active, available, maintenance, retired, lost, warranty_expiring: warrantyExpiring, by_type: byType, by_branch: byBranch, total_value: totalValue, total_depreciation: Math.round(totalDepreciation*100)/100, total_book_value: Math.round(totalBookValue*100)/100, maintenance_due: maintenanceDue }, { headers: CACHE_SHORT });
    }

    if (action === "assets") {
      const typeFilter = req.nextUrl.searchParams.get("type");
      const statusFilter = req.nextUrl.searchParams.get("status");
      const branchFilter = req.nextUrl.searchParams.get("branch");
      let q = supabase.from("it_assets").select("*").limit(5000);
      if (typeFilter && ASSET_TYPES.includes(typeFilter)) q = q.eq("asset_type", typeFilter);
      if (statusFilter && ASSET_STATUSES.includes(statusFilter)) q = q.eq("status", statusFilter);
      if (branchFilter) q = q.eq("branch", branchFilter);
      const { data: assets } = await q;
      return NextResponse.json({ assets: assets ?? [] }, { headers: CACHE_SHORT });
    }

    if (action === "asset") {
      const id = req.nextUrl.searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { data } = await supabase.from("it_assets").select("*").eq("id", id).maybeSingle();
      if (!data) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      return NextResponse.json({ asset: data }, { headers: CACHE_SHORT });
    }

    if (action === "history") {
      const assetId = req.nextUrl.searchParams.get("asset_id");
      if (!assetId) return NextResponse.json({ error: "asset_id required" }, { status: 400 });
      const { data } = await supabase.from("it_asset_history").select("*").eq("asset_id", assetId).order("timestamp", { ascending: false }).limit(1000);
      return NextResponse.json({ history: data ?? [] }, { headers: CACHE_SHORT });
    }

    if (action === "staff-assets") {
      const staffNumber = req.nextUrl.searchParams.get("staff_number");
      if (!staffNumber) return NextResponse.json({ error: "staff_number required" }, { status: 400 });
      const { data: assets } = await supabase.from("it_assets").select("*").eq("assigned_to", staffNumber).limit(500);
      return NextResponse.json({ assets: assets ?? [] }, { headers: CACHE_SHORT });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("IT Inventory GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  if (!hasPermission(auth.role, "inventory.manage")) return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });

  const supabase = createServiceClient();
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "create_asset") {
      const { asset_type, brand, model, serial_number, purchase_date, purchase_price, warranty_expiry, status, condition, location, branch, notes, specs, useful_life_years, salvage_value, next_maintenance_date, maintenance_interval_days } = body;
      if (!asset_type || !brand || !model || !serial_number) return NextResponse.json({ error: "asset_type, brand, model, and serial_number are required" }, { status: 400 });

      const { count: dupCount } = await supabase.from("it_assets").select("id", { count: "exact", head: true }).eq("serial_number", serial_number);
      if ((dupCount ?? 0) > 0) return NextResponse.json({ error: `An asset with serial number "${serial_number}" already exists` }, { status: 409 });

      const prefix = TYPE_PREFIX[asset_type] || "OT";
      const { count } = await supabase.from("it_assets").select("id", { count: "exact", head: true }).eq("asset_type", asset_type);
      const assetId = `KIS-${prefix}-${String((count ?? 0) + 1).padStart(4, "0")}`;

      const doc = { asset_id: assetId, asset_type, brand: brand||"", model: model||"", serial_number: serial_number||"", purchase_date: purchase_date||null, purchase_price: typeof purchase_price==="number"?purchase_price:null, warranty_expiry: warranty_expiry||null, status: ASSET_STATUSES.includes(status)?status:"available", condition: ASSET_CONDITIONS.includes(condition)?condition:"good", location: location||"", branch: branch||"", assigned_to: null, assigned_to_name: null, assigned_date: null, notes: notes||"", specs: specs||{}, created_at: new Date().toISOString(), updated_by: body.performed_by||"system", useful_life_years: typeof useful_life_years==="number"?useful_life_years:null, salvage_value: typeof salvage_value==="number"?salvage_value:null, next_maintenance_date: next_maintenance_date||null, maintenance_interval_days: typeof maintenance_interval_days==="number"?maintenance_interval_days:null };

      const { data: newRow } = await supabase.from("it_assets").insert(doc).select("id").single();
      await supabase.from("it_asset_history").insert({ asset_id: assetId, action: "created", from_staff: null, to_staff: null, timestamp: new Date().toISOString(), performed_by: body.performed_by||"system", notes: `Created asset ${assetId}: ${brand} ${model}` });
      return NextResponse.json({ id: (newRow as Record<string,unknown>|null)?.id, ...doc });
    }

    if (action === "update_asset") {
      const { id, ...fields } = body;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      delete fields.action;
      fields.updated_by = body.performed_by || "system";
      delete fields.performed_by;
      const { data: existing } = await supabase.from("it_assets").select("id, asset_id").eq("id", id as string).maybeSingle();
      if (!existing) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      await supabase.from("it_assets").update(fields).eq("id", id as string);
      await supabase.from("it_asset_history").insert({ asset_id: (existing as Record<string,unknown>).asset_id||id, action: "updated", from_staff: null, to_staff: null, timestamp: new Date().toISOString(), performed_by: body.performed_by||"system", notes: `Updated fields: ${Object.keys(fields).filter(k=>k!=="updated_by").join(", ")}` });
      return NextResponse.json({ success: true });
    }

    if (action === "assign_asset") {
      const { asset_id, staff_number, staff_name, performed_by } = body;
      if (!asset_id || !staff_number) return NextResponse.json({ error: "asset_id and staff_number required" }, { status: 400 });
      const { count: staffCount } = await supabase.from("staff").select("id", { count: "exact", head: true }).eq("Staff_Number", staff_number);
      if ((staffCount ?? 0) === 0) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
      const { data: row } = await supabase.from("it_assets").select("*").eq("asset_id", String(asset_id)).maybeSingle();
      if (!row) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      const prevData = row as Record<string,unknown>;
      await supabase.from("it_assets").update({ assigned_to: staff_number, assigned_to_name: staff_name||null, assigned_date: new Date().toISOString(), status: "active" }).eq("asset_id", String(asset_id));
      await supabase.from("it_asset_history").insert({ asset_id, action: "assigned", from_staff: prevData.assigned_to||null, to_staff: staff_number, timestamp: new Date().toISOString(), performed_by: performed_by||"system", notes: `Assigned to ${staff_name||staff_number}` });
      return NextResponse.json({ success: true });
    }

    if (action === "return_asset") {
      const { asset_id, condition: returnCondition, notes: returnNotes, performed_by } = body;
      if (!asset_id) return NextResponse.json({ error: "asset_id required" }, { status: 400 });
      const { data: row } = await supabase.from("it_assets").select("*").eq("asset_id", String(asset_id)).maybeSingle();
      if (!row) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      const prevData = row as Record<string,unknown>;
      const updates: Record<string,unknown> = { assigned_to: null, assigned_to_name: null, assigned_date: null, status: "available" };
      if (returnCondition && ASSET_CONDITIONS.includes(returnCondition)) updates.condition = returnCondition;
      await supabase.from("it_assets").update(updates).eq("asset_id", String(asset_id));
      await supabase.from("it_asset_history").insert({ asset_id, action: "returned", from_staff: prevData.assigned_to||null, to_staff: null, timestamp: new Date().toISOString(), performed_by: performed_by||"system", notes: returnNotes||`Returned from ${prevData.assigned_to_name||"unknown"}` });
      return NextResponse.json({ success: true });
    }

    if (action === "update_status") {
      const { asset_id, status, notes: statusNotes, performed_by } = body;
      if (!asset_id || !status || !ASSET_STATUSES.includes(status)) return NextResponse.json({ error: "Valid asset_id and status required" }, { status: 400 });
      const { count } = await supabase.from("it_assets").select("id", { count: "exact", head: true }).eq("asset_id", String(asset_id));
      if ((count??0)===0) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      await supabase.from("it_assets").update({ status }).eq("asset_id", String(asset_id));
      await supabase.from("it_asset_history").insert({ asset_id, action: "status_change", from_staff: null, to_staff: null, timestamp: new Date().toISOString(), performed_by: performed_by||"system", notes: statusNotes||`Status changed to ${status}` });
      return NextResponse.json({ success: true });
    }

    if (action === "schedule_maintenance") {
      const { asset_id, next_maintenance_date, maintenance_interval_days, notes: maintNotes, performed_by } = body;
      if (!asset_id || !next_maintenance_date) return NextResponse.json({ error: "asset_id and next_maintenance_date required" }, { status: 400 });
      const { count } = await supabase.from("it_assets").select("id", { count: "exact", head: true }).eq("asset_id", String(asset_id));
      if ((count??0)===0) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      const updates: Record<string,unknown> = { next_maintenance_date };
      if (typeof maintenance_interval_days==="number" && maintenance_interval_days>0) updates.maintenance_interval_days=maintenance_interval_days;
      await supabase.from("it_assets").update(updates).eq("asset_id", String(asset_id));
      await supabase.from("it_asset_history").insert({ asset_id, action: "maintenance", from_staff: null, to_staff: null, timestamp: new Date().toISOString(), performed_by: performed_by||"system", notes: maintNotes||`Maintenance scheduled for ${next_maintenance_date}` });
      return NextResponse.json({ success: true });
    }

    if (action === "complete_maintenance") {
      const { asset_id, condition: maintCondition, notes: maintNotes, performed_by } = body;
      if (!asset_id) return NextResponse.json({ error: "asset_id required" }, { status: 400 });
      const { data: row } = await supabase.from("it_assets").select("*").eq("asset_id", String(asset_id)).maybeSingle();
      if (!row) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      const rowData = row as Record<string,unknown>;
      const updates: Record<string,unknown> = { status: "available" };
      if (maintCondition && ASSET_CONDITIONS.includes(maintCondition)) updates.condition=maintCondition;
      if (typeof rowData.maintenance_interval_days==="number" && rowData.maintenance_interval_days>0) { const next=new Date(); next.setDate(next.getDate()+rowData.maintenance_interval_days); updates.next_maintenance_date=next.toISOString().split("T")[0]; } else { updates.next_maintenance_date=null; }
      await supabase.from("it_assets").update(updates).eq("asset_id", String(asset_id));
      await supabase.from("it_asset_history").insert({ asset_id, action: "maintenance", from_staff: null, to_staff: null, timestamp: new Date().toISOString(), performed_by: performed_by||"system", notes: maintNotes||"Maintenance completed" });
      return NextResponse.json({ success: true });
    }

    if (action === "delete_asset") {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { data: existing } = await supabase.from("it_assets").select("id, asset_id").eq("id", id as string).maybeSingle();
      if (!existing) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      await supabase.from("it_assets").delete().eq("id", id as string);
      return NextResponse.json({ success: true });
    }

    if (action === "bulk_import") {
      const { assets, performed_by } = body;
      if (!Array.isArray(assets) || assets.length===0) return NextResponse.json({ error: "assets array required" }, { status: 400 });
      let imported=0;
      for (const item of assets) {
        if (!item.asset_type || !item.brand || !item.model || !item.serial_number) continue;
        const prefix = TYPE_PREFIX[item.asset_type]||"OT";
        const { count } = await supabase.from("it_assets").select("id", { count: "exact", head: true }).eq("asset_type", item.asset_type);
        const assetId = `KIS-${prefix}-${String((count??0)+1+imported).padStart(4,"0")}`;
        await supabase.from("it_assets").insert({ asset_id: assetId, asset_type: item.asset_type, brand: item.brand||"", model: item.model||"", serial_number: item.serial_number||"", purchase_date: item.purchase_date||null, purchase_price: item.purchase_price?Number(item.purchase_price):null, warranty_expiry: item.warranty_expiry||null, status: ASSET_STATUSES.includes(item.status)?item.status:"available", condition: ASSET_CONDITIONS.includes(item.condition)?item.condition:"good", location: item.location||"", branch: item.branch||"", assigned_to: item.assigned_to||null, assigned_to_name: item.assigned_to_name||null, assigned_date: item.assigned_to?new Date().toISOString():null, notes: item.notes||"", specs: item.specs||{}, created_at: new Date().toISOString(), updated_by: performed_by||"system", useful_life_years: item.useful_life_years?Number(item.useful_life_years):null, salvage_value: item.salvage_value?Number(item.salvage_value):null, next_maintenance_date: item.next_maintenance_date||null, maintenance_interval_days: item.maintenance_interval_days?Number(item.maintenance_interval_days):null });
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
