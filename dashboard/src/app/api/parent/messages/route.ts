import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_PRIVATE } from "@/lib/cache-headers";

/**
 * GET /api/parent/messages?familyNumber=123&school=B&class=24&section=A
 * Returns messages relevant to the given family / school / class.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const familyNumber = params.get("familyNumber");
  const school = params.get("school");
  const classCode = params.get("class");
  const section = params.get("section");

  if (!familyNumber) {
    return NextResponse.json(
      { error: "familyNumber is required" },
      { status: 400 }
    );
  }

  try {
    const snap = await adminDb
      .collection("messages")
      .orderBy("created_at", "desc")
      .limit(50)
      .get();

    interface MessageOut {
      id: string;
      title: string;
      body: string;
      sender: string;
      audience: string;
      created_at: string;
      read: boolean;
    }

    const messages: MessageOut[] = [];

    for (const doc of snap.docs) {
      const data = doc.data();
      const audience = data.audience as string;
      const filter = data.audience_filter || {};

      let match = false;
      if (audience === "all") {
        match = true;
      } else if (audience === "school" && school) {
        match = filter.school === school;
      } else if (audience === "class" && school && classCode) {
        match =
          filter.school === school &&
          filter.class === classCode &&
          (!filter.section || filter.section === section);
      } else if (audience === "family") {
        match = String(filter.family_number) === String(familyNumber);
      }

      if (match) {
        const readBy: string[] = data.read_by || [];
        const createdAt = data.created_at?.toDate
          ? data.created_at.toDate().toISOString()
          : data.created_at || "";

        messages.push({
          id: doc.id,
          title: data.title || "Message",
          body: data.body || "",
          sender: data.sender || "School Admin",
          audience,
          created_at: createdAt,
          read: readBy.includes(String(familyNumber)),
        });
      }
    }

    return NextResponse.json({ messages }, { headers: CACHE_PRIVATE });
  } catch (err) {
    console.error("Error fetching messages:", err);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/parent/messages/read  { messageId, familyNumber }
 * Marks a message as read for a family.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messageId, familyNumber: fn } = body;

    if (!messageId || !fn) {
      return NextResponse.json(
        { error: "messageId and familyNumber are required" },
        { status: 400 }
      );
    }

    const { FieldValue } = await import("firebase-admin/firestore");
    await adminDb
      .collection("messages")
      .doc(String(messageId))
      .update({ read_by: FieldValue.arrayUnion(String(fn)) });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error marking message read:", err);
    return NextResponse.json(
      { error: "Failed to mark as read" },
      { status: 500 }
    );
  }
}
