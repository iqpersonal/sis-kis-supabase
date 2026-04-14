import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CACHE_PRIVATE } from "@/lib/cache-headers";

/**
 * GET /api/parent/library?studentNumber=12345
 * Returns library borrowing records for a specific student.
 */
export async function GET(req: NextRequest) {
  const studentNumber = req.nextUrl.searchParams.get("studentNumber");
  if (!studentNumber) {
    return NextResponse.json(
      { error: "studentNumber is required" },
      { status: 400 }
    );
  }

  try {
    const snap = await adminDb
      .collection("library_borrowings")
      .where("student_number", "==", studentNumber)
      .orderBy("borrow_date", "desc")
      .limit(100)
      .get();

    const now = new Date();

    const borrowings = snap.docs.map((doc) => {
      const d = doc.data();
      let status = d.status as string;
      if (status === "borrowed" && d.due_date) {
        const due = new Date(d.due_date);
        if (due < now) status = "overdue";
      }
      return {
        id: doc.id,
        book_title: d.book_title || "",
        book_title_ar: d.book_title_ar || "",
        author: d.author || "",
        borrow_date: d.borrow_date || "",
        due_date: d.due_date || "",
        return_date: d.return_date || null,
        status,
      };
    });

    const active = borrowings.filter(
      (b) => b.status === "borrowed" || b.status === "overdue"
    );
    const overdue = borrowings.filter((b) => b.status === "overdue");
    const returned = borrowings.filter((b) => b.status === "returned");

    return NextResponse.json(
      {
        borrowings,
        summary: {
          borrowed: active.length,
          overdue: overdue.length,
          returned: returned.length,
          total: borrowings.length,
        },
      },
      { headers: CACHE_PRIVATE }
    );
  } catch (err) {
    console.error("Parent library error:", err);
    return NextResponse.json(
      { error: "Failed to fetch library data" },
      { status: 500 }
    );
  }
}
