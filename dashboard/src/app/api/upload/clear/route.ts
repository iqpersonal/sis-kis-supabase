import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

const COLLECTION = "reports";

/**
 * DELETE /api/upload
 *
 * Clears all documents in the "reports" collection.
 * Useful before re-uploading fresh data.
 */
export async function DELETE() {
  try {
    const snapshot = await adminDb.collection(COLLECTION).get();

    if (snapshot.empty) {
      return NextResponse.json({
        success: true,
        message: "Collection is already empty",
        count: 0,
      });
    }

    const BATCH_SIZE = 500;
    let deleted = 0;

    const docs = snapshot.docs;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = adminDb.batch();
      const chunk = docs.slice(i, i + BATCH_SIZE);
      for (const doc of chunk) {
        batch.delete(doc.ref);
      }
      await batch.commit();
      deleted += chunk.length;
    }

    return NextResponse.json({
      success: true,
      message: `Deleted ${deleted} document(s)`,
      count: deleted,
    });
  } catch (err) {
    console.error("Clear collection error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to clear collection",
      },
      { status: 500 }
    );
  }
}
