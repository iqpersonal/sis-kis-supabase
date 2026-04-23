import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/messages/send
 * Send a custom message from the dashboard to parents.
 * Also triggers push notifications via Expo Push API.
 *
 * Body: { title, body, audience, audience_filter?, sender }
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const data = await req.json();
    const { title, body, audience, audience_filter, sender } = data;

    if (!title || !body || !audience || !sender) {
      return NextResponse.json(
        { error: "title, body, audience, and sender are required" },
        { status: 400 }
      );
    }

    // 1. Write message to Firestore
    const msgRef = await adminDb.collection("messages").add({
      title,
      body,
      audience, // "all" | "school" | "class" | "family"
      audience_filter: audience_filter || {},
      sender,
      created_at: FieldValue.serverTimestamp(),
      read_by: [],
    });

    // 2. Collect push tokens based on audience
    let pushTokens: string[] = [];

    if (audience === "all") {
      const snap = await adminDb.collection("push_tokens").get();
      snap.docs.forEach((doc) => {
        const tokens = doc.data().tokens || [];
        tokens.forEach((t: { token: string }) => {
          if (t.token) pushTokens.push(t.token);
        });
      });
    } else if (audience === "school" && audience_filter?.school) {
      const snap = await adminDb
        .collection("push_tokens")
        .where("school", "==", audience_filter.school)
        .get();
      snap.docs.forEach((doc) => {
        const tokens = doc.data().tokens || [];
        tokens.forEach((t: { token: string }) => {
          if (t.token) pushTokens.push(t.token);
        });
      });
    } else if (audience === "class" && audience_filter?.school) {
      // Targets is an array of { class, section? }
      const targets: { class: string; section?: string }[] =
        audience_filter.targets || [];
      if (targets.length > 0) {
        // Group targets by class for efficient querying
        const classCodes = [...new Set(targets.map((t) => t.class))];
        for (const classCode of classCodes) {
          let q: FirebaseFirestore.Query = adminDb
            .collection("push_tokens")
            .where("school", "==", audience_filter.school)
            .where("class", "==", classCode);

          // If specific sections for this class, filter by them
          const sectionsForClass = targets
            .filter((t) => t.class === classCode && t.section)
            .map((t) => t.section!);

          if (sectionsForClass.length > 0) {
            // Firestore "in" supports up to 30 values
            const chunks: string[][] = [];
            for (let i = 0; i < sectionsForClass.length; i += 30) {
              chunks.push(sectionsForClass.slice(i, i + 30));
            }
            for (const chunk of chunks) {
              const snap = await q.where("section", "in", chunk).get();
              snap.docs.forEach((doc) => {
                const tokens = doc.data().tokens || [];
                tokens.forEach((t: { token: string }) => {
                  if (t.token) pushTokens.push(t.token);
                });
              });
            }
          } else {
            const snap = await q.get();
            snap.docs.forEach((doc) => {
              const tokens = doc.data().tokens || [];
              tokens.forEach((t: { token: string }) => {
                if (t.token) pushTokens.push(t.token);
              });
            });
          }
        }
      }
      // Deduplicate tokens
      pushTokens = [...new Set(pushTokens)];
    } else if (audience === "family" && audience_filter?.family_number) {
      const snap = await adminDb
        .collection("push_tokens")
        .where("family_number", "==", audience_filter.family_number)
        .get();
      snap.docs.forEach((doc) => {
        const tokens = doc.data().tokens || [];
        tokens.forEach((t: { token: string }) => {
          if (t.token) pushTokens.push(t.token);
        });
      });
    }

    // 3. Send push notifications via Expo Push API
    let pushSent = 0;
    if (pushTokens.length > 0) {
      // Expo accepts batches of up to 100
      const chunks: string[][] = [];
      for (let i = 0; i < pushTokens.length; i += 100) {
        chunks.push(pushTokens.slice(i, i + 100));
      }

      for (const chunk of chunks) {
        const messages = chunk.map((token) => ({
          to: token,
          sound: "default" as const,
          title,
          body: body.length > 200 ? body.slice(0, 197) + "..." : body,
          data: { messageId: msgRef.id },
        }));

        const resp = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(messages),
        });

        if (resp.ok) {
          pushSent += chunk.length;
        }
      }
    }

    return NextResponse.json({
      success: true,
      messageId: msgRef.id,
      pushTokensFound: pushTokens.length,
      pushSent,
    });
  } catch (err) {
    console.error("Send message error:", err);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
