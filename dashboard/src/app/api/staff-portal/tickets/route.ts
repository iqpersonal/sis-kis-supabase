import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

function extractToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7);
  return null;
}

async function getStaffNumber(email: string): Promise<string | null> {
  const snap = await adminDb
    .collection("staff")
    .where("E_Mail", "==", email.toLowerCase())
    .limit(1)
    .get();
  if (snap.empty) {
    const snap2 = await adminDb
      .collection("staff")
      .where("E_Mail", "==", email)
      .limit(1)
      .get();
    if (snap2.empty) return null;
    return snap2.docs[0].data().Staff_Number || snap2.docs[0].id;
  }
  return snap.docs[0].data().Staff_Number || snap.docs[0].id;
}

/**
 * GET /api/staff-portal/tickets
 * Returns the caller's tickets. If ?all=true and caller is admin, returns all tickets.
 */
export async function GET(req: NextRequest) {
  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const wantAll = req.nextUrl.searchParams.get("all") === "true";

  if (wantAll) {
    // Admin-level: check admin_users doc
    const adminSnap = await adminDb.collection("admin_users").doc(decoded.uid).get();
    if (!adminSnap.exists) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const snap = await adminDb
      .collection("it_tickets")
      .orderBy("created_at", "desc")
      .limit(200)
      .get();

    const tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ tickets });
  }

  // Staff-level: own tickets only
  const staffNumber = await getStaffNumber(decoded.email || "");
  if (!staffNumber) {
    return NextResponse.json({ error: "Staff not found" }, { status: 404 });
  }

  const snap = await adminDb
    .collection("it_tickets")
    .where("staff_number", "==", staffNumber)
    .orderBy("created_at", "desc")
    .limit(50)
    .get();

  const tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ tickets });
}

/**
 * POST /api/staff-portal/tickets
 * Creates a new IT support ticket
 */
export async function POST(req: NextRequest) {
  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const email = decoded.email || "";
  const staffNumber = await getStaffNumber(email);
  if (!staffNumber) {
    return NextResponse.json({ error: "Staff not found" }, { status: 404 });
  }

  // Get staff name
  const staffSnap = await adminDb
    .collection("staff")
    .where("Staff_Number", "==", staffNumber)
    .limit(1)
    .get();
  const staffName = staffSnap.empty
    ? email
    : staffSnap.docs[0].data().E_Full_Name || email;

  const body = await req.json();
  const { title, description, category, priority } = body;

  if (!title || !description) {
    return NextResponse.json(
      { error: "Title and description are required" },
      { status: 400 }
    );
  }

  // Generate ticket ID
  const countSnap = await adminDb
    .collection("counters")
    .doc("it_tickets")
    .get();
  const nextNum = (countSnap.exists ? (countSnap.data()?.count || 0) : 0) + 1;
  const ticketId = `IT-TKT-${String(nextNum).padStart(4, "0")}`;

  const doc = {
    ticket_id: ticketId,
    staff_number: staffNumber,
    staff_name: staffName,
    title,
    description,
    category: category || "other",
    priority: priority || "medium",
    status: "open",
    assigned_to: null,
    notes: [],
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  const ref = await adminDb.collection("it_tickets").add(doc);

  // Update counter
  await adminDb
    .collection("counters")
    .doc("it_tickets")
    .set({ count: nextNum }, { merge: true });

  return NextResponse.json(
    { id: ref.id, ticket_id: ticketId, success: true },
    { status: 201 }
  );
}

/**
 * PATCH /api/staff-portal/tickets
 * Update a ticket (add note, change status)
 */
export async function PATCH(req: NextRequest) {
  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = await req.json();
  const { ticketId, note, status, assigned_to } = body;

  if (!ticketId) {
    return NextResponse.json(
      { error: "ticketId is required" },
      { status: 400 }
    );
  }

  const ticketRef = adminDb.collection("it_tickets").doc(ticketId);
  const ticketSnap = await ticketRef.get();
  if (!ticketSnap.exists) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    updated_at: FieldValue.serverTimestamp(),
  };

  if (status) {
    updates.status = status;
  }

  if (assigned_to !== undefined) {
    updates.assigned_to = assigned_to;
  }

  if (note) {
    updates.notes = FieldValue.arrayUnion({
      text: note,
      author: decoded.email || "unknown",
      timestamp: new Date().toISOString(),
    });
  }

  await ticketRef.update(updates);
  return NextResponse.json({ success: true });
}
