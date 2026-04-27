import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_PRIVATE } from "@/lib/cache-headers";

export async function GET(req: NextRequest) {
  const studentNumber = req.nextUrl.searchParams.get("studentNumber");
  if (!studentNumber) return NextResponse.json({ error: "studentNumber is required" }, { status: 400 });

  try {
    const supabase = createServiceClient();
    const now = new Date();

    const { data: rows } = await supabase
      .from("library_borrowings")
      .select("id, book_title, book_title_ar, author, borrow_date, due_date, return_date, status")
      .eq("student_number", studentNumber.trim())
      .order("borrow_date", { ascending: false })
      .limit(100);

    const borrowings = (rows ?? []).map((row) => {
      const d = row as Record<string, unknown>;
      let status = String(d["status"] || "borrowed");
      if (status === "borrowed" && d["due_date"]) {
        if (new Date(String(d["due_date"])) < now) status = "overdue";
      }
      return {
        id: String(d["id"]),
        book_title: String(d["book_title"] || ""),
        book_title_ar: String(d["book_title_ar"] || ""),
        author: String(d["author"] || ""),
        borrow_date: String(d["borrow_date"] || ""),
        due_date: String(d["due_date"] || ""),
        return_date: d["return_date"] ? String(d["return_date"]) : null,
        status,
      };
    });

    const active = borrowings.filter((b) => b.status === "borrowed" || b.status === "overdue");
    const overdue = borrowings.filter((b) => b.status === "overdue");
    const returned = borrowings.filter((b) => b.status === "returned");

    return NextResponse.json({
      borrowings,
      summary: { borrowed: active.length, overdue: overdue.length, returned: returned.length, total: borrowings.length },
    }, { headers: CACHE_PRIVATE });
  } catch (err) {
    console.error("Parent library error:", err);
    return NextResponse.json({ error: "Failed to fetch library data" }, { status: 500 });
  }
}
