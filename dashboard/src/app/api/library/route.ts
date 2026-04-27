import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CACHE_SHORT, CACHE_MEDIUM } from "@/lib/cache-headers";
import { verifyAuth } from "@/lib/api-auth";

let lastMarkOverdueRun = 0;
const MARK_OVERDUE_INTERVAL_MS = 5 * 60 * 1000;

interface LibSettings {
  default_loan_days: number;
  max_books_per_student: number;
  overdue_fine_per_day: number;
  lost_book_fee: number;
  grace_period_days: number;
  conditions: string[];
}
const DEFAULT_SETTINGS: LibSettings = {
  default_loan_days: 14, max_books_per_student: 3,
  overdue_fine_per_day: 0, lost_book_fee: 50,
  grace_period_days: 0,
  conditions: ["excellent", "good", "fair", "poor", "damaged"],
};

async function getSettings(supabase: ReturnType<typeof createServiceClient>): Promise<LibSettings> {
  try {
    const { data } = await supabase.from("app_config").select("data").eq("id", "library_settings").maybeSingle();
    return data ? { ...DEFAULT_SETTINGS, ...(data.data as Partial<LibSettings>) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

async function markOverdue(supabase: ReturnType<typeof createServiceClient>) {
  const now = Date.now();
  if (now - lastMarkOverdueRun < MARK_OVERDUE_INTERVAL_MS) return;
  lastMarkOverdueRun = now;
  try {
    const today = new Date().toISOString().slice(0, 10);
    await supabase
      .from("library_borrowings")
      .update({ status: "overdue" })
      .eq("status", "borrowed")
      .lt("due_date", today);
  } catch { /* ignore */ }
}

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") || "stats";
  const supabase = createServiceClient();

  try {
    if (action === "stats") {
      const settings = await getSettings(supabase);
      const [
        { count: totalBooks },
        { count: activeBorrow },
        { count: overdueCount },
        { count: totalCopies },
        { count: availCopies },
        { count: lostCopies },
        { count: damagedCopies },
      ] = await Promise.all([
        supabase.from("library_books").select("*", { count: "exact", head: true }),
        supabase.from("library_borrowings").select("*", { count: "exact", head: true }).in("status", ["borrowed", "overdue"]),
        supabase.from("library_borrowings").select("*", { count: "exact", head: true }).eq("status", "overdue"),
        supabase.from("library_copies").select("*", { count: "exact", head: true }),
        supabase.from("library_copies").select("*", { count: "exact", head: true }).eq("status", "available"),
        supabase.from("library_copies").select("*", { count: "exact", head: true }).eq("status", "lost"),
        supabase.from("library_copies").select("*", { count: "exact", head: true }).eq("status", "damaged"),
      ]);

      let totalFines = 0;
      if (settings.overdue_fine_per_day > 0) {
        const { data: overdueRows } = await supabase.from("library_borrowings").select("due_date").eq("status", "overdue");
        const nowMs = Date.now();
        for (const row of overdueRows ?? []) {
          const d = row as Record<string, unknown>;
          const dueMs = new Date(String(d["due_date"] || "")).getTime();
          if (!isNaN(dueMs)) {
            const days = Math.max(0, Math.ceil((nowMs - dueMs) / 86400000) - settings.grace_period_days);
            totalFines += days * settings.overdue_fine_per_day;
          }
        }
      }
      const { count: lostBorrows } = await supabase.from("library_borrowings").select("*", { count: "exact", head: true }).eq("status", "lost");
      totalFines += (lostBorrows ?? 0) * settings.lost_book_fee;

      return NextResponse.json({
        total_books: totalBooks ?? 0, total_copies: totalCopies ?? 0,
        available_copies: availCopies ?? 0, active_borrowings: activeBorrow ?? 0,
        overdue: overdueCount ?? 0, lost: lostCopies ?? 0,
        damaged: damagedCopies ?? 0, total_fines: Math.round(totalFines * 100) / 100,
        settings,
      }, { headers: CACHE_SHORT });
    }

    if (action === "books") {
      const { data: books } = await supabase.from("library_books").select("*").order("title");
      return NextResponse.json({ books: books ?? [] }, { headers: CACHE_MEDIUM });
    }

    if (action === "student") {
      const studentNumber = req.nextUrl.searchParams.get("studentNumber");
      if (!studentNumber) return NextResponse.json({ error: "studentNumber is required" }, { status: 400 });
      await markOverdue(supabase);
      const { data: borrowings } = await supabase
        .from("library_borrowings").select("*")
        .eq("student_number", studentNumber.trim())
        .order("borrow_date", { ascending: false })
        .limit(100);
      return NextResponse.json({ borrowings: borrowings ?? [] }, { headers: CACHE_SHORT });
    }

    if (action === "borrowings") {
      const statusFilter = req.nextUrl.searchParams.get("status");
      await markOverdue(supabase);
      let q = supabase.from("library_borrowings").select("*").order("borrow_date", { ascending: false });
      if (statusFilter && statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data: borrowings } = await q.limit(500);
      return NextResponse.json({ borrowings: borrowings ?? [] }, { headers: CACHE_SHORT });
    }

    if (action === "lookup_copy") {
      const barcode = req.nextUrl.searchParams.get("barcode");
      if (!barcode) return NextResponse.json({ error: "barcode is required" }, { status: 400 });
      const { data: copy } = await supabase.from("library_copies").select("*").eq("barcode", barcode).maybeSingle();
      if (!copy) return NextResponse.json({ error: "Barcode not found" }, { status: 404 });
      const copyData = copy as Record<string, unknown>;
      const { data: book } = await supabase.from("library_books").select("*").eq("id", String(copyData["book_id"])).maybeSingle();
      if (!book) return NextResponse.json({ error: "Book record not found" }, { status: 404 });

      let activeBorrowing: Record<string, unknown> | null = null;
      if (copyData["status"] !== "available") {
        const { data: borrowRows } = await supabase
          .from("library_borrowings").select("*")
          .eq("copy_id", String(copyData["id"])).in("status", ["borrowed", "overdue"]).limit(1);
        activeBorrowing = borrowRows?.[0] as Record<string, unknown> ?? null;
      }
      return NextResponse.json({ copy, book, active_borrowing: activeBorrowing }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "find_duplicates") {
      const { data: allBooks } = await supabase.from("library_books").select("id, title, author, total_copies, created_at");
      const groups = new Map<string, Array<{ id: string; title: string; author: string; total_copies: number; created_at: unknown }>>();
      for (const row of allBooks ?? []) {
        const d = row as Record<string, unknown>;
        const key = `${String(d["title"] ?? "").toLowerCase().trim()}|${String(d["author"] ?? "").toLowerCase().trim()}`;
        const arr = groups.get(key) ?? [];
        arr.push({ id: String(d["id"]), title: String(d["title"]), author: String(d["author"]), total_copies: Number(d["total_copies"] ?? 0), created_at: d["created_at"] });
        groups.set(key, arr);
      }
      const duplicates = [...groups.values()].filter((g) => g.length > 1);
      return NextResponse.json({ duplicate_groups: duplicates.length, total_extra_docs: duplicates.reduce((s, g) => s + g.length - 1, 0), groups: duplicates }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "reports") {
      const reportType = req.nextUrl.searchParams.get("type") || "most_borrowed";

      if (reportType === "most_borrowed") {
        const { data: rows } = await supabase.from("library_borrowings").select("book_id, book_title");
        const counts: Record<string, { title: string; count: number }> = {};
        for (const row of rows ?? []) {
          const d = row as Record<string, unknown>;
          const k = String(d["book_id"] || "unknown");
          if (!counts[k]) counts[k] = { title: String(d["book_title"] || "Unknown"), count: 0 };
          counts[k].count++;
        }
        const ranked = Object.entries(counts).map(([bookId, v]) => ({ bookId, title: v.title, borrowCount: v.count })).sort((a, b) => b.borrowCount - a.borrowCount).slice(0, 20);
        return NextResponse.json({ report: "most_borrowed", data: ranked }, { headers: CACHE_SHORT });
      }

      if (reportType === "monthly_trend") {
        const { data: rows } = await supabase.from("library_borrowings").select("borrow_date, status");
        const months: Record<string, { borrowed: number; returned: number }> = {};
        for (const row of rows ?? []) {
          const d = row as Record<string, unknown>;
          const month = String(d["borrow_date"] || "").slice(0, 7);
          if (!month) continue;
          if (!months[month]) months[month] = { borrowed: 0, returned: 0 };
          months[month].borrowed++;
          if (d["status"] === "returned") months[month].returned++;
        }
        const sorted = Object.entries(months).map(([month, v]) => ({ month, ...v })).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
        return NextResponse.json({ report: "monthly_trend", data: sorted }, { headers: CACHE_SHORT });
      }

      if (reportType === "top_readers") {
        const { data: rows } = await supabase.from("library_borrowings").select("student_number, student_name");
        const readers: Record<string, { name: string; count: number }> = {};
        for (const row of rows ?? []) {
          const d = row as Record<string, unknown>;
          const sn = String(d["student_number"] || "unknown");
          if (!readers[sn]) readers[sn] = { name: String(d["student_name"] || sn), count: 0 };
          readers[sn].count++;
        }
        const ranked = Object.entries(readers).map(([studentNumber, v]) => ({ studentNumber, studentName: v.name, borrowCount: v.count })).sort((a, b) => b.borrowCount - a.borrowCount).slice(0, 20);
        return NextResponse.json({ report: "top_readers", data: ranked }, { headers: CACHE_SHORT });
      }

      if (reportType === "by_category") {
        const [{ data: booksRows }, { data: borrowRows }] = await Promise.all([
          supabase.from("library_books").select("id, category, total_copies, available_copies"),
          supabase.from("library_borrowings").select("book_id"),
        ]);
        const bookCats: Record<string, string> = {};
        const catCopies: Record<string, { total: number; available: number }> = {};
        for (const row of booksRows ?? []) {
          const d = row as Record<string, unknown>;
          const cat = String(d["category"] || "Other");
          bookCats[String(d["id"])] = cat;
          if (!catCopies[cat]) catCopies[cat] = { total: 0, available: 0 };
          catCopies[cat].total += Number(d["total_copies"] || 0);
          catCopies[cat].available += Number(d["available_copies"] || 0);
        }
        const catBorrows: Record<string, number> = {};
        for (const row of borrowRows ?? []) {
          const d = row as Record<string, unknown>;
          const cat = bookCats[String(d["book_id"])] || "Other";
          catBorrows[cat] = (catBorrows[cat] || 0) + 1;
        }
        const data = Object.keys({ ...catCopies, ...catBorrows }).map((cat) => ({
          category: cat, totalCopies: catCopies[cat]?.total || 0,
          availableCopies: catCopies[cat]?.available || 0, totalBorrows: catBorrows[cat] || 0,
        })).sort((a, b) => b.totalBorrows - a.totalBorrows);
        return NextResponse.json({ report: "by_category", data }, { headers: CACHE_SHORT });
      }

      if (reportType === "overdue_detail") {
        const settings = await getSettings(supabase);
        await markOverdue(supabase);
        const { data: rows } = await supabase.from("library_borrowings").select("*").eq("status", "overdue").order("due_date", { ascending: true });
        const nowMs = Date.now();
        const data = (rows ?? []).map((row) => {
          const d = row as Record<string, unknown>;
          const dueMs = new Date(String(d["due_date"] || "")).getTime();
          const overdueDays = Math.max(0, Math.ceil((nowMs - dueMs) / 86400000) - settings.grace_period_days);
          const fine = overdueDays * settings.overdue_fine_per_day;
          return { id: String(d["id"]), student_number: String(d["student_number"]), student_name: String(d["student_name"]), book_title: String(d["book_title"]), borrow_date: String(d["borrow_date"]), due_date: String(d["due_date"]), overdue_days: overdueDays, fine: Math.round(fine * 100) / 100 };
        });
        return NextResponse.json({ report: "overdue_detail", data, total_fines: data.reduce((s, r) => s + r.fine, 0) }, { headers: CACHE_SHORT });
      }

      return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("Library GET error:", err);
    return NextResponse.json({ error: "Failed to fetch library data" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;

  const supabase = createServiceClient();

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "checkout") {
      const { studentNumber, studentName, bookId } = body;
      if (!studentNumber || !bookId) return NextResponse.json({ error: "studentNumber and bookId are required" }, { status: 400 });

      const sn = String(studentNumber).trim();
      const { data: studentRow } = await supabase.from("student_progress").select("student_number, student_name, student_name_ar").eq("student_number", sn).maybeSingle();
      if (!studentRow) return NextResponse.json({ error: "Student not found." }, { status: 404 });
      const sd = studentRow as Record<string, unknown>;
      const canonicalName = String(sd["student_name"] || sd["student_name_ar"] || studentName || "").trim();
      if (!canonicalName) return NextResponse.json({ error: "Student record is missing a usable name." }, { status: 400 });

      const settings = await getSettings(supabase);
      const { count: activeCount } = await supabase.from("library_borrowings").select("*", { count: "exact", head: true }).eq("student_number", sn).in("status", ["borrowed", "overdue"]);
      if ((activeCount ?? 0) >= settings.max_books_per_student) {
        return NextResponse.json({ error: `Student already has ${activeCount} active borrowing(s). Maximum is ${settings.max_books_per_student}.` }, { status: 400 });
      }

      let dueDate = body.dueDate;
      if (!dueDate) {
        const d = new Date();
        d.setDate(d.getDate() + settings.default_loan_days);
        dueDate = d.toISOString();
      }

      const { data: book } = await supabase.from("library_books").select("*").eq("id", bookId).maybeSingle();
      if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
      const bookData = book as Record<string, unknown>;
      if ((bookData["available_copies"] as number ?? 0) <= 0) return NextResponse.json({ error: "No copies available" }, { status: 400 });

      const { data: copyRows } = await supabase.from("library_copies").select("id").eq("book_id", bookId).eq("status", "available").limit(1);
      if (!copyRows || copyRows.length === 0) return NextResponse.json({ error: "No physical copy available" }, { status: 400 });
      const copyId = String((copyRows[0] as Record<string, unknown>)["id"]);
      const borrowingId = crypto.randomUUID();

      await Promise.all([
        supabase.from("library_borrowings").insert({
          id: borrowingId, student_number: sn, student_name: canonicalName,
          book_id: bookId, book_title: String(bookData["title"] || ""),
          book_title_ar: String(bookData["title_ar"] || ""),
          author: String(bookData["author"] || ""),
          copy_id: copyId, borrow_date: new Date().toISOString(),
          due_date: dueDate, return_date: null, status: "borrowed",
          notes: body.notes || "", checked_out_by: body.checkedOutBy || "admin",
        }),
        supabase.from("library_copies").update({ status: "borrowed" }).eq("id", copyId),
        supabase.from("library_books").update({ available_copies: (bookData["available_copies"] as number) - 1 }).eq("id", bookId),
      ]);

      return NextResponse.json({ success: true, borrowingId, message: `Checked out "${bookData["title"]}" to ${canonicalName}` });
    }

    if (action === "checkin") {
      const { borrowingId, condition, notes } = body;
      if (!borrowingId) return NextResponse.json({ error: "borrowingId is required" }, { status: 400 });
      const { data: borrow } = await supabase.from("library_borrowings").select("*").eq("id", borrowingId).maybeSingle();
      if (!borrow) return NextResponse.json({ error: "Borrowing record not found" }, { status: 404 });
      const bd = borrow as Record<string, unknown>;
      if (bd["status"] === "returned") return NextResponse.json({ error: "Already returned" }, { status: 400 });

      const settings = await getSettings(supabase);
      let fine = 0;
      const nowMs = Date.now();
      const dueMs = new Date(String(bd["due_date"] || "")).getTime();
      if (!isNaN(dueMs) && nowMs > dueMs) {
        const overdueDays = Math.max(0, Math.ceil((nowMs - dueMs) / 86400000) - settings.grace_period_days);
        fine = overdueDays * settings.overdue_fine_per_day;
      }

      const returnUpdate: Record<string, unknown> = { status: "returned", return_date: new Date().toISOString(), return_condition: condition || null, fine: Math.round(fine * 100) / 100 };
      if (notes) returnUpdate.return_notes = notes;

      const ops: Promise<unknown>[] = [supabase.from("library_borrowings").update(returnUpdate).eq("id", borrowingId)];
      if (bd["copy_id"]) {
        const copyUpdate: Record<string, unknown> = { status: "available" };
        if (condition) copyUpdate.condition = condition;
        ops.push(supabase.from("library_copies").update(copyUpdate).eq("id", String(bd["copy_id"])));
      }
      if (bd["book_id"]) {
        const { data: bookRow } = await supabase.from("library_books").select("available_copies").eq("id", String(bd["book_id"])).maybeSingle();
        if (bookRow) {
          ops.push(supabase.from("library_books").update({ available_copies: ((bookRow as Record<string, unknown>)["available_copies"] as number) + 1 }).eq("id", String(bd["book_id"])));
        }
      }
      await Promise.all(ops);
      return NextResponse.json({ success: true, message: `Checked in "${bd["book_title"]}"`, fine, condition: condition || null });
    }

    if (action === "mark_lost") {
      const { borrowingId } = body;
      if (!borrowingId) return NextResponse.json({ error: "borrowingId is required" }, { status: 400 });
      const { data: borrow } = await supabase.from("library_borrowings").select("*").eq("id", borrowingId).maybeSingle();
      if (!borrow) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const bd = borrow as Record<string, unknown>;
      if (bd["status"] === "returned" || bd["status"] === "lost") return NextResponse.json({ error: "Invalid status for marking lost" }, { status: 400 });
      const settings = await getSettings(supabase);
      const ops: Promise<unknown>[] = [
        supabase.from("library_borrowings").update({ status: "lost", lost_date: new Date().toISOString(), fine: settings.lost_book_fee }).eq("id", borrowingId),
      ];
      if (bd["copy_id"]) ops.push(supabase.from("library_copies").update({ status: "lost" }).eq("id", String(bd["copy_id"])));
      await Promise.all(ops);
      return NextResponse.json({ success: true, message: `Marked "${bd["book_title"]}" as lost. Fee: ${settings.lost_book_fee} SAR`, fine: settings.lost_book_fee });
    }

    if (action === "add_book") {
      const { title, title_ar, author, isbn, category, language, publication_year, publisher, total_copies } = body;
      if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
      const copies = total_copies || 1;
      const bookId = crypto.randomUUID();
      await supabase.from("library_books").insert({ id: bookId, title, title_ar: title_ar || "", author: author || "", isbn: isbn || "", category: category || "", language: language || "English", publication_year: publication_year || null, publisher: publisher || "", total_copies: copies, available_copies: copies, cover_url: "" });
      const copyRows = Array.from({ length: copies }, (_, i) => ({
        id: crypto.randomUUID(), book_id: bookId,
        barcode: `KIS-${bookId.slice(0, 6).toUpperCase()}-${String(i + 1).padStart(3, "0")}`,
        status: "available", location: "Main Library", condition: "good",
      }));
      if (copyRows.length > 0) {
        for (let i = 0; i < copyRows.length; i += 500) await supabase.from("library_copies").insert(copyRows.slice(i, i + 500));
      }
      return NextResponse.json({ success: true, bookId, message: `Added "${title}" with ${copies} copies` });
    }

    if (action === "update_book") {
      const { bookId, ...fields } = body;
      if (!bookId) return NextResponse.json({ error: "bookId is required" }, { status: 400 });
      const { data: existing } = await supabase.from("library_books").select("title").eq("id", bookId).maybeSingle();
      if (!existing) return NextResponse.json({ error: "Book not found" }, { status: 404 });
      const allowed = ["title", "title_ar", "author", "isbn", "category", "language", "publication_year", "publisher"];
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const key of allowed) if (fields[key] !== undefined) updates[key] = fields[key];
      await supabase.from("library_books").update(updates).eq("id", bookId);
      return NextResponse.json({ success: true, message: `Updated "${fields.title || (existing as Record<string, unknown>)["title"]}"` });
    }

    if (action === "renew") {
      const { borrowingId } = body;
      if (!borrowingId) return NextResponse.json({ error: "borrowingId is required" }, { status: 400 });
      const { data: borrow } = await supabase.from("library_borrowings").select("*").eq("id", borrowingId).maybeSingle();
      if (!borrow) return NextResponse.json({ error: "Borrowing not found" }, { status: 404 });
      const bd = borrow as Record<string, unknown>;
      if (bd["status"] === "returned" || bd["status"] === "lost") return NextResponse.json({ error: "Cannot renew a returned or lost book" }, { status: 400 });
      const settings = await getSettings(supabase);
      const newDue = new Date();
      newDue.setDate(newDue.getDate() + settings.default_loan_days);
      await supabase.from("library_borrowings").update({ due_date: newDue.toISOString(), status: "borrowed", renewed_at: new Date().toISOString() }).eq("id", borrowingId);
      return NextResponse.json({ success: true, message: `Renewed until ${newDue.toLocaleDateString()}`, new_due_date: newDue.toISOString() });
    }

    if (action === "delete_book") {
      const { bookId } = body;
      if (!bookId) return NextResponse.json({ error: "bookId is required" }, { status: 400 });
      const { count } = await supabase.from("library_borrowings").select("*", { count: "exact", head: true }).eq("book_id", bookId).eq("status", "borrowed");
      if ((count ?? 0) > 0) return NextResponse.json({ error: "Cannot delete book with active borrowings" }, { status: 400 });
      await supabase.from("library_copies").delete().eq("book_id", bookId);
      await supabase.from("library_books").delete().eq("id", bookId);
      return NextResponse.json({ success: true, message: "Book deleted" });
    }

    if (action === "bulk_import_books") {
      const { books } = body as { books: Record<string, string | number>[] };
      if (!Array.isArray(books) || books.length === 0) return NextResponse.json({ error: "books array is required" }, { status: 400 });
      if (books.length > 5000) return NextResponse.json({ error: "Maximum 5000 books per import" }, { status: 400 });

      const incomingIsbns = [...new Set(books.map((b) => String(b["ISBN"] ?? b.isbn ?? "").trim()).filter(Boolean))];
      const existingIsbns = new Set<string>();
      for (let i = 0; i < incomingIsbns.length; i += 500) {
        const { data: rows } = await supabase.from("library_books").select("isbn").in("isbn", incomingIsbns.slice(i, i + 500));
        (rows ?? []).forEach((r) => existingIsbns.add(String((r as Record<string, unknown>)["isbn"])));
      }

      let added = 0; let skipped = 0;
      const errors: string[] = [];
      const bookRows: Record<string, unknown>[] = [];
      const copyRows: Record<string, unknown>[] = [];

      for (const row of books) {
        const title = String(row["Book Title"] ?? row.title ?? "").trim();
        if (!title) { errors.push("Row missing Book Title"); continue; }
        const isbn = String(row["ISBN"] ?? row.isbn ?? "").trim();
        if (isbn && existingIsbns.has(isbn)) { skipped++; continue; }
        const totalCopies = Math.max(1, Number(row["Quantity"] ?? row.total_copies ?? 1) || 1);
        const bookId = crypto.randomUUID();
        bookRows.push({ id: bookId, title, title_ar: "", author: String(row["Author"] ?? row.author ?? "").trim(), isbn, category: String(row["Genre"] ?? row.category ?? "").trim(), language: "English", publisher: String(row["Publisher"] ?? row.publisher ?? "").trim(), age_group: String(row["Age Group"] ?? row.age_group ?? "").trim(), grade_level: String(row["Grade Level"] ?? row.grade_level ?? "").trim(), pages: Number(row["# of Pages"] ?? row.pages ?? 0) || null, call_number: String(row["Book Number"] ?? row.call_number ?? "").trim(), total_copies: totalCopies, available_copies: totalCopies, cover_url: "" });
        const shelfLocation = String(row["Bookshelf Number"] ?? row.location ?? "").trim() || "Main Library";
        for (let ci = 1; ci <= totalCopies; ci++) {
          copyRows.push({ id: crypto.randomUUID(), book_id: bookId, barcode: `KIS-${bookId.slice(0, 6).toUpperCase()}-${String(ci).padStart(3, "0")}`, status: "available", location: shelfLocation, condition: "good" });
        }
        added++;
      }

      for (let i = 0; i < bookRows.length; i += 500) await supabase.from("library_books").insert(bookRows.slice(i, i + 500));
      for (let i = 0; i < copyRows.length; i += 500) await supabase.from("library_copies").insert(copyRows.slice(i, i + 500));

      return NextResponse.json({ success: true, added, skipped, errors });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("Library POST error:", err);
    return NextResponse.json({ error: "Failed to process library action" }, { status: 500 });
  }
}
