import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const token = authHeader.slice(7);

  let decoded;
  try { decoded = await adminAuth.verifyIdToken(token); } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }); }

  const email = decoded.email;
  if (!email) return NextResponse.json({ error: "No email associated with this account" }, { status: 400 });

  const supabase = createServiceClient();
  let staffRow: Record<string,unknown>|null = null;
  { const { data } = await supabase.from("staff").select("*").ilike("E_Mail", email).limit(1); staffRow = (data && data.length > 0) ? data[0] as Record<string,unknown> : null; }

  if (!staffRow) return NextResponse.json({ error: "No staff profile found for this email" }, { status: 404 });

  const d = staffRow;
  const profile = { uid: decoded.uid, email, staffNumber: d.Staff_Number || d.id, fullNameEn: d.E_Full_Name || `${d.E_First_Name||""} ${d.E_Family_Name||}`.trim(), fullNameAr: d.A_Full_Name || `${d.A_First_Name||""} ${d.A_Family_Name||}`.trim(), firstName: d.E_First_Name || d.A_First_Name || "", department: d.Employee_Group_ID||null, position: d.Position_Code||null, school: d.School_Code||null, branch: d.Branch_Code||null, idNumber: d.ID_Number||null, enrollmentDate: d.Enrollment_Date||null, sex: d.Sex||null, nationality: d.Primary_Nationality||null, isActive: d.is_active??true };
  return NextResponse.json({ profile });
}
