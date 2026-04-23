import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { CACHE_SHORT, CACHE_MEDIUM } from "@/lib/cache-headers";
import { verifyAuth } from "@/lib/api-auth";

// markOverdue cooldown — only scan+write at most once every 5 minutes per server instance
let lastMarkOverdueRun = 0;
const MARK_OVERDUE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Library Management API
 *
 * GET /api/library
 *   ?action=books          → list all books (catalog)
 *   ?action=borrowings     → list current borrowings (optionally filtered)
 *   ?action=student&studentNumber=XXX → borrowings for a specific student
 *   ?action=stats          → summary statistics
 *   ?action=settings       → library settings (limits, loan days, fines)
 *   ?action=reports&type=X → library reports (most_borrowed, by_class, monthly_trend, top_readers, inventory)
 *
 * POST /api/library
 *   { action: "checkout", studentNumber, studentName, bookId, dueDate? }
 *   { action: "checkin",  borrowingId, condition?, notes? }
 *   { action: "add_book", ...bookFields }
 *   { action: "update_book", bookId, ...fields }
 *   { action: "delete_book", bookId }
 *   { action: "mark_lost", borrowingId }
 */

/* ── Settings helper ─────────────────────────────────────────── */
interface LibSettings {
  default_loan_days: number;
  max_books_per_student: number;
  overdue_fine_per_day: number;
  lost_book_fee: number;
  grace_period_days: number;
  conditions: string[];
}
const DEFAULT_SETTINGS: LibSettings = {
  default_loan_days: 14,
  max_books_per_student: 3,
  overdue_fine_per_day: 0,
  lost_book_fee: 50,
  grace_period_days: 0,
  conditions: ["excellent", "good", "fair", "poor", "damaged"],
};
async function getSettings(): Promise<LibSettings> {
  try {
    const doc = await adminDb.collection("app_config").doc("library_settings").get();
    return doc.exists ? { ...DEFAULT_SETTINGS, ...doc.data() } as LibSettings : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// ── GET ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") || "stats";

  try {
    // ── Stats ──
    if (action === "stats") {
      const settings = await getSettings();
      const [booksSnap, borrowSnap, overdueSnap] = await Promise.all([
        adminDb.collection("library_books").count().get(),
        adminDb
          .collection("library_borrowings")
          .where("status", "==", "borrowed")
          .count()
          .get(),
        adminDb
          .collection("library_borrowings")
          .where("status", "==", "overdue")
          .count()
          .get(),
      ]);

      const totalBooks = booksSnap.data().count;
      const activeBorrowings =
        borrowSnap.data().count + overdueSnap.data().count;
      const overdueCount = overdueSnap.data().count;

      // total copies
      const copiesSnap = await adminDb.collection("library_copies").count().get();
      const availSnap = await adminDb
        .collection("library_copies")
        .where("status", "==", "available")
        .count()
        .get();
      const lostSnap = await adminDb
        .collection("library_copies")
        .where("status", "==", "lost")
        .count()
        .get();
      const damagedSnap = await adminDb
        .collection("library_copies")
        .where("status", "==", "damaged")
        .count()
        .get();

      // Calculate total outstanding fines
      let totalFines = 0;
      if (settings.overdue_fine_per_day > 0) {
        const overdueDocsSnap = await adminDb
          .collection("library_borrowings")
          .where("status", "==", "overdue")
          .get();
        const now = Date.now();
        for (const doc of overdueDocsSnap.docs) {
          const dueDate = doc.data().due_date;
          if (dueDate) {
            const overdueDays = Math.max(0, Math.ceil((now - new Date(dueDate).getTime()) / 86400000) - settings.grace_period_days);
            totalFines += overdueDays * settings.overdue_fine_per_day;
          }
        }
      }

      // Count lost book fees
      const lostBorrowSnap = await adminDb
        .collection("library_borrowings")
        .where("status", "==", "lost")
        .count()
        .get();
      totalFines += lostBorrowSnap.data().count * settings.lost_book_fee;

      return NextResponse.json({
        total_books: totalBooks,
        total_copies: copiesSnap.data().count,
        available_copies: availSnap.data().count,
        active_borrowings: activeBorrowings,
        overdue: overdueCount,
        lost: lostSnap.data().count,
        damaged: damagedSnap.data().count,
        total_fines: Math.round(totalFines * 100) / 100,
        settings,
      }, { headers: CACHE_SHORT });
    }

    // ── Books catalog ──
    if (action === "books") {
      const snap = await adminDb
        .collection("library_books")
        .orderBy("title")
        .get();

      const books = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return NextResponse.json({ books }, { headers: CACHE_MEDIUM });
    }

    // ── Student borrowings ──
    if (action === "student") {
      const studentNumber = req.nextUrl.searchParams.get("studentNumber");
      if (!studentNumber) {
        return NextResponse.json(
          { error: "studentNumber is required" },
          { status: 400 }
        );
      }

      // Mark overdue borrowings first
      await markOverdue();

      const snap = await adminDb
        .collection("library_borrowings")
        .where("student_number", "==", studentNumber.trim())
        .orderBy("borrow_date", "desc")
        .limit(100)
        .get();

      const borrowings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return NextResponse.json({ borrowings }, { headers: CACHE_SHORT });
    }

    // ── All borrowings ──
    if (action === "borrowings") {
      const statusFilter = req.nextUrl.searchParams.get("status"); // borrowed | returned | overdue | all

      await markOverdue();

      let q: FirebaseFirestore.Query = adminDb
        .collection("library_borrowings")
        .orderBy("borrow_date", "desc");

      if (statusFilter && statusFilter !== "all") {
        q = adminDb
          .collection("library_borrowings")
          .where("status", "==", statusFilter)
          .orderBy("borrow_date", "desc");
      }

      const snap = await q.limit(500).get();
      const borrowings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return NextResponse.json({ borrowings }, { headers: CACHE_SHORT });
    }

    // ── Reports ──
    // ── Lookup Copy by barcode (mobile librarian) ──
    if (action === "lookup_copy") {
      const barcode = req.nextUrl.searchParams.get("barcode");
      if (!barcode) {
        return NextResponse.json({ error: "barcode is required" }, { status: 400 });
      }
      const copySnap = await adminDb
        .collection("library_copies")
        .where("barcode", "==", barcode)
        .limit(1)
        .get();
      if (copySnap.empty) {
        return NextResponse.json({ error: "Barcode not found" }, { status: 404 });
      }
      const copyDoc = copySnap.docs[0];
      const copyData = copyDoc.data();
      const bookDoc = await adminDb.collection("library_books").doc(copyData.book_id).get();
      if (!bookDoc.exists) {
        return NextResponse.json({ error: "Book record not found" }, { status: 404 });
      }

      // Find active borrowing for this copy (if any)
      let activeBorrowing: Record<string, unknown> | null = null;
      if (copyData.status !== "available") {
        const borrowSnap = await adminDb
          .collection("library_borrowings")
          .where("copy_id", "==", copyDoc.id)
          .where("status", "in", ["borrowed", "overdue"])
          .limit(1)
          .get();
        if (!borrowSnap.empty) {
          activeBorrowing = { id: borrowSnap.docs[0].id, ...borrowSnap.docs[0].data() };
        }
      }

      return NextResponse.json({
        copy: { id: copyDoc.id, ...copyData },
        book: { id: bookDoc.id, ...bookDoc.data() },
        active_borrowing: activeBorrowing,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    // ── Find Duplicates ──
    if (action === "find_duplicates") {
      const snap = await adminDb.collection("library_books").get();
      const groups = new Map<string, Array<{ id: string; title: string; author: string; total_copies: number; created_at: unknown }>>();
      for (const doc of snap.docs) {
        const d = doc.data();
        const key = [
          String(d.title ?? "").toLowerCase().trim(),
          String(d.author ?? "").toLowerCase().trim(),
        ].join("|");
        const arr = groups.get(key) ?? [];
        arr.push({ id: doc.id, title: d.title, author: d.author, total_copies: d.total_copies ?? 0, created_at: d.created_at });
        groups.set(key, arr);
      }
      const duplicates = [...groups.values()].filter((g) => g.length > 1);
      return NextResponse.json({
        duplicate_groups: duplicates.length,
        total_extra_docs: duplicates.reduce((s, g) => s + g.length - 1, 0),
        groups: duplicates,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "reports") {
      const reportType = req.nextUrl.searchParams.get("type") || "most_borrowed";

      if (reportType === "most_borrowed") {
        const snap = await adminDb.collection("library_borrowings").get();
        const counts: Record<string, { title: string; count: number }> = {};
        for (const doc of snap.docs) {
          const d = doc.data();
          const key = d.book_id || "unknown";
          if (!counts[key]) counts[key] = { title: d.book_title || "Unknown", count: 0 };
          counts[key].count++;
        }
        const ranked = Object.entries(counts)
          .map(([bookId, v]) => ({ bookId, title: v.title, borrowCount: v.count }))
          .sort((a, b) => b.borrowCount - a.borrowCount)
          .slice(0, 20);
        return NextResponse.json({ report: "most_borrowed", data: ranked }, { headers: CACHE_SHORT });
      }

      if (reportType === "monthly_trend") {
        const snap = await adminDb.collection("library_borrowings").get();
        const months: Record<string, { borrowed: number; returned: number }> = {};
        for (const doc of snap.docs) {
          const d = doc.data();
          const month = (d.borrow_date || "").slice(0, 7);
          if (!month) continue;
          if (!months[month]) months[month] = { borrowed: 0, returned: 0 };
          months[month].borrowed++;
          if (d.status === "returned") months[month].returned++;
        }
        const sorted = Object.entries(months)
          .map(([month, v]) => ({ month, ...v }))
          .sort((a, b) => a.month.localeCompare(b.month))
          .slice(-12);
        return NextResponse.json({ report: "monthly_trend", data: sorted }, { headers: CACHE_SHORT });
      }

      if (reportType === "top_readers") {
        const snap = await adminDb.collection("library_borrowings").get();
        const readers: Record<string, { name: string; count: number }> = {};
        for (const doc of snap.docs) {
          const d = doc.data();
          const sn = d.student_number || "unknown";
          if (!readers[sn]) readers[sn] = { name: d.student_name || sn, count: 0 };
          readers[sn].count++;
        }
        const ranked = Object.entries(readers)
          .map(([studentNumber, v]) => ({ studentNumber, studentName: v.name, borrowCount: v.count }))
          .sort((a, b) => b.borrowCount - a.borrowCount)
          .slice(0, 20);
        return NextResponse.json({ report: "top_readers", data: ranked }, { headers: CACHE_SHORT });
      }

      if (reportType === "by_category") {
        const booksSnap2 = await adminDb.collection("library_books").get();
        const bookCats: Record<string, string> = {};
        const catCopies: Record<string, { total: number; available: number }> = {};
        for (const doc of booksSnap2.docs) {
          const d = doc.data();
          bookCats[doc.id] = d.category || "Other";
          const cat = d.category || "Other";
          if (!catCopies[cat]) catCopies[cat] = { total: 0, available: 0 };
          catCopies[cat].total += d.total_copies || 0;
          catCopies[cat].available += d.available_copies || 0;
        }
        const borrowSnap2 = await adminDb.collection("library_borrowings").get();
        const catBorrows: Record<string, number> = {};
        for (const doc of borrowSnap2.docs) {
          const cat = bookCats[doc.data().book_id] || "Other";
          catBorrows[cat] = (catBorrows[cat] || 0) + 1;
        }
        const data = Object.keys({ ...catCopies, ...catBorrows }).map((cat) => ({
          category: cat,
          totalCopies: catCopies[cat]?.total || 0,
          availableCopies: catCopies[cat]?.available || 0,
          totalBorrows: catBorrows[cat] || 0,
        })).sort((a, b) => b.totalBorrows - a.totalBorrows);
        return NextResponse.json({ report: "by_category", data }, { headers: CACHE_SHORT });
      }

      if (reportType === "overdue_detail") {
        const settings = await getSettings();
        await markOverdue();
        const snap = await adminDb
          .collection("library_borrowings")
          .where("status", "==", "overdue")
          .orderBy("due_date", "asc")
          .get();
        const now = Date.now();
        const data = snap.docs.map((doc) => {
          const d = doc.data();
          const dueMs = new Date(d.due_date).getTime();
          const overdueDays = Math.max(0, Math.ceil((now - dueMs) / 86400000) - settings.grace_period_days);
          const fine = overdueDays * settings.overdue_fine_per_day;
          return {
            id: doc.id,
            student_number: d.student_number,
            student_name: d.student_name,
            book_title: d.book_title,
            borrow_date: d.borrow_date,
            due_date: d.due_date,
            overdue_days: overdueDays,
            fine: Math.round(fine * 100) / 100,
          };
        });
        return NextResponse.json({
          report: "overdue_detail",
          data,
          total_fines: data.reduce((s, r) => s + r.fine, 0),
        }, { headers: CACHE_SHORT });
      }

      return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("Library GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch library data" },
      { status: 500 }
    );
  }
}

// ── POST ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { action } = body;

    // ── Checkout ──
    if (action === "checkout") {
      const { studentNumber, studentName, bookId } = body;
      if (!studentNumber || !bookId) {
        return NextResponse.json(
          { error: "studentNumber and bookId are required" },
          { status: 400 }
        );
      }

      const normalizedStudentNumber = String(studentNumber).trim();
      const studentSnap = await adminDb
        .collection("student_progress")
        .doc(normalizedStudentNumber)
        .get();

      if (!studentSnap.exists) {
        return NextResponse.json(
          { error: "Student not found. Search and select a valid student before checkout." },
          { status: 404 }
        );
      }

      const studentData = studentSnap.data() ?? {};
      const canonicalStudentName =
        String(studentData.student_name || studentData.student_name_ar || studentName || "").trim();

      if (!canonicalStudentName) {
        return NextResponse.json(
          { error: "Student record is missing a usable name." },
          { status: 400 }
        );
      }

      const settings = await getSettings();

      // Enforce borrowing limit
      const activeSnap = await adminDb
        .collection("library_borrowings")
        .where("student_number", "==", normalizedStudentNumber)
        .where("status", "in", ["borrowed", "overdue"])
        .count()
        .get();
      if (activeSnap.data().count >= settings.max_books_per_student) {
        return NextResponse.json(
          { error: `Student already has ${activeSnap.data().count} active borrowing(s). Maximum is ${settings.max_books_per_student}.` },
          { status: 400 }
        );
      }

      // Auto-calculate due date if not provided
      let dueDate = body.dueDate;
      if (!dueDate) {
        const d = new Date();
        d.setDate(d.getDate() + settings.default_loan_days);
        dueDate = d.toISOString();
      }

      // Get book info
      const bookDoc = await adminDb
        .collection("library_books")
        .doc(bookId)
        .get();
      if (!bookDoc.exists) {
        return NextResponse.json(
          { error: "Book not found" },
          { status: 404 }
        );
      }
      const bookData = bookDoc.data()!;

      if ((bookData.available_copies || 0) <= 0) {
        return NextResponse.json(
          { error: "No copies available" },
          { status: 400 }
        );
      }

      // Find an available copy
      const copySnap = await adminDb
        .collection("library_copies")
        .where("book_id", "==", bookId)
        .where("status", "==", "available")
        .limit(1)
        .get();

      if (copySnap.empty) {
        return NextResponse.json(
          { error: "No physical copy available" },
          { status: 400 }
        );
      }

      const batch = adminDb.batch();

      // Create borrowing record
      const borrowRef = adminDb.collection("library_borrowings").doc();
      batch.set(borrowRef, {
        student_number: normalizedStudentNumber,
        student_name: canonicalStudentName,
        book_id: bookId,
        book_title: bookData.title || "",
        book_title_ar: bookData.title_ar || "",
        author: bookData.author || "",
        copy_id: copySnap.docs[0].id,
        borrow_date: new Date().toISOString(),
        due_date: dueDate,
        return_date: null,
        status: "borrowed",
        notes: body.notes || "",
        checked_out_by: body.checkedOutBy || "admin",
        created_at: FieldValue.serverTimestamp(),
      });

      // Update copy status
      batch.update(copySnap.docs[0].ref, { status: "borrowed" });

      // Decrement available copies
      batch.update(bookDoc.ref, {
        available_copies: FieldValue.increment(-1),
      });

      await batch.commit();

      return NextResponse.json({
        success: true,
        borrowingId: borrowRef.id,
        message: `Checked out "${bookData.title}" to ${canonicalStudentName}`,
      });
    }

    // ── Checkin ──
    if (action === "checkin") {
      const { borrowingId, condition, notes } = body;
      if (!borrowingId) {
        return NextResponse.json(
          { error: "borrowingId is required" },
          { status: 400 }
        );
      }

      const borrowDoc = await adminDb
        .collection("library_borrowings")
        .doc(borrowingId)
        .get();
      if (!borrowDoc.exists) {
        return NextResponse.json(
          { error: "Borrowing record not found" },
          { status: 404 }
        );
      }

      const borrowData = borrowDoc.data()!;
      if (borrowData.status === "returned") {
        return NextResponse.json(
          { error: "Already returned" },
          { status: 400 }
        );
      }

      // Calculate fine if overdue
      const settings = await getSettings();
      let fine = 0;
      const now = Date.now();
      const dueMs = new Date(borrowData.due_date).getTime();
      if (now > dueMs) {
        const overdueDays = Math.max(0, Math.ceil((now - dueMs) / 86400000) - settings.grace_period_days);
        fine = overdueDays * settings.overdue_fine_per_day;
      }

      const batch = adminDb.batch();

      // Update borrowing
      const returnUpdate: Record<string, unknown> = {
        status: "returned",
        return_date: new Date().toISOString(),
        return_condition: condition || null,
        fine: Math.round(fine * 100) / 100,
      };
      if (notes) returnUpdate.return_notes = notes;
      batch.update(borrowDoc.ref, returnUpdate);

      // Update copy status and condition
      if (borrowData.copy_id) {
        const copyRef = adminDb
          .collection("library_copies")
          .doc(borrowData.copy_id);
        const copyUpdate: Record<string, unknown> = { status: "available" };
        if (condition) copyUpdate.condition = condition;
        batch.update(copyRef, copyUpdate);
      }

      // Increment available copies on book
      if (borrowData.book_id) {
        const bookRef = adminDb
          .collection("library_books")
          .doc(borrowData.book_id);
        batch.update(bookRef, {
          available_copies: FieldValue.increment(1),
        });
      }

      await batch.commit();

      return NextResponse.json({
        success: true,
        message: `Checked in "${borrowData.book_title}"`,
        fine,
        condition: condition || null,
      });
    }

    // ── Mark Lost ──
    if (action === "mark_lost") {
      const { borrowingId } = body;
      if (!borrowingId) {
        return NextResponse.json({ error: "borrowingId is required" }, { status: 400 });
      }

      const borrowDoc = await adminDb
        .collection("library_borrowings")
        .doc(borrowingId)
        .get();
      if (!borrowDoc.exists) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const borrowData = borrowDoc.data()!;
      if (borrowData.status === "returned" || borrowData.status === "lost") {
        return NextResponse.json({ error: "Invalid status for marking lost" }, { status: 400 });
      }

      const settings = await getSettings();
      const batch = adminDb.batch();

      batch.update(borrowDoc.ref, {
        status: "lost",
        lost_date: new Date().toISOString(),
        fine: settings.lost_book_fee,
      });

      if (borrowData.copy_id) {
        batch.update(
          adminDb.collection("library_copies").doc(borrowData.copy_id),
          { status: "lost" }
        );
      }

      await batch.commit();

      return NextResponse.json({
        success: true,
        message: `Marked "${borrowData.book_title}" as lost. Fee: ${settings.lost_book_fee} SAR`,
        fine: settings.lost_book_fee,
      });
    }

    // ── Add Book ──
    if (action === "add_book") {
      const { title, title_ar, author, isbn, category, language, publication_year, publisher, total_copies } = body;
      if (!title) {
        return NextResponse.json(
          { error: "title is required" },
          { status: 400 }
        );
      }

      const copies = total_copies || 1;
      const bookRef = adminDb.collection("library_books").doc();
      await bookRef.set({
        title,
        title_ar: title_ar || "",
        author: author || "",
        isbn: isbn || "",
        category: category || "",
        language: language || "English",
        publication_year: publication_year || null,
        publisher: publisher || "",
        total_copies: copies,
        available_copies: copies,
        cover_url: "",
        created_at: FieldValue.serverTimestamp(),
      });

      // Create physical copy records
      const batch = adminDb.batch();
      for (let i = 1; i <= copies; i++) {
        const copyRef = adminDb.collection("library_copies").doc();
        batch.set(copyRef, {
          book_id: bookRef.id,
          barcode: `KIS-${bookRef.id.slice(0, 6).toUpperCase()}-${String(i).padStart(3, "0")}`,
          status: "available",
          location: "Main Library",
          condition: "good",
          created_at: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();

      return NextResponse.json({
        success: true,
        bookId: bookRef.id,
        message: `Added "${title}" with ${copies} copies`,
      });
    }

    // ── Update Book ──
    if (action === "update_book") {
      const { bookId, ...fields } = body;
      if (!bookId) {
        return NextResponse.json({ error: "bookId is required" }, { status: 400 });
      }
      const bookRef = adminDb.collection("library_books").doc(bookId);
      const bookDoc = await bookRef.get();
      if (!bookDoc.exists) {
        return NextResponse.json({ error: "Book not found" }, { status: 404 });
      }

      const allowed = ["title", "title_ar", "author", "isbn", "category", "language", "publication_year", "publisher"];
      const updates: Record<string, unknown> = { updated_at: FieldValue.serverTimestamp() };
      for (const key of allowed) {
        if (fields[key] !== undefined) updates[key] = fields[key];
      }
      await bookRef.update(updates);
      return NextResponse.json({ success: true, message: `Updated "${fields.title || bookDoc.data()!.title}"` });
    }

    // ── Renew (extend due date) ──
    if (action === "renew") {
      const { borrowingId } = body;
      if (!borrowingId) {
        return NextResponse.json({ error: "borrowingId is required" }, { status: 400 });
      }
      const borrowDoc = await adminDb.collection("library_borrowings").doc(borrowingId).get();
      if (!borrowDoc.exists) {
        return NextResponse.json({ error: "Borrowing not found" }, { status: 404 });
      }
      const borrowData = borrowDoc.data()!;
      if (borrowData.status === "returned" || borrowData.status === "lost") {
        return NextResponse.json({ error: "Cannot renew a returned or lost book" }, { status: 400 });
      }
      const settings = await getSettings();
      const newDue = new Date();
      newDue.setDate(newDue.getDate() + settings.default_loan_days);
      await borrowDoc.ref.update({
        due_date: newDue.toISOString(),
        status: "borrowed",
        renewed_at: new Date().toISOString(),
      });
      return NextResponse.json({
        success: true,
        message: `Renewed until ${newDue.toLocaleDateString()}`,
        new_due_date: newDue.toISOString(),
      });
    }

    // ── Delete Book ──
    if (action === "delete_book") {
      const { bookId } = body;
      if (!bookId) {
        return NextResponse.json(
          { error: "bookId is required" },
          { status: 400 }
        );
      }

      // Check for active borrowings
      const activeSnap = await adminDb
        .collection("library_borrowings")
        .where("book_id", "==", bookId)
        .where("status", "==", "borrowed")
        .limit(1)
        .get();

      if (!activeSnap.empty) {
        return NextResponse.json(
          { error: "Cannot delete book with active borrowings" },
          { status: 400 }
        );
      }

      // Delete copies
      const copiesSnap = await adminDb
        .collection("library_copies")
        .where("book_id", "==", bookId)
        .get();

      const batch = adminDb.batch();
      copiesSnap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(adminDb.collection("library_books").doc(bookId));
      await batch.commit();

      return NextResponse.json({ success: true, message: "Book deleted" });
    }

    // ── Bulk Import Books ──
    if (action === "bulk_import_books") {
      const { books } = body as { books: Record<string, string | number>[] };
      if (!Array.isArray(books) || books.length === 0) {
        return NextResponse.json({ error: "books array is required" }, { status: 400 });
      }
      if (books.length > 5000) {
        return NextResponse.json({ error: "Maximum 5000 books per import" }, { status: 400 });
      }

      // Collect non-empty ISBNs to check for existing duplicates
      const incomingIsbns = [...new Set(
        books.map((b) => String(b["ISBN"] ?? b.isbn ?? "").trim()).filter(Boolean)
      )];

      const existingIsbns = new Set<string>();
      if (incomingIsbns.length > 0) {
        const CHUNK = 30;
        for (let ci = 0; ci < incomingIsbns.length; ci += CHUNK) {
          const chunk = incomingIsbns.slice(ci, ci + CHUNK);
          const snap = await adminDb
            .collection("library_books")
            .where("isbn", "in", chunk)
            .get();
          snap.docs.forEach((d) => existingIsbns.add(String(d.data().isbn)));
        }
      }

      let added = 0;
      let skipped = 0;
      const errors: string[] = [];

      // Batch writer — auto-commits and starts a fresh batch when approaching the 500-write limit
      let currentBatch = adminDb.batch();
      let opsInBatch = 0;

      async function flushBatch() {
        if (opsInBatch > 0) {
          await currentBatch.commit();
          currentBatch = adminDb.batch();
          opsInBatch = 0;
        }
      }

      for (const row of books) {
        const title = String(row["Book Title"] ?? row.title ?? "").trim();
        if (!title) { errors.push("Row missing Book Title — skipped"); continue; }

        const isbn = String(row["ISBN"] ?? row.isbn ?? "").trim();
        if (isbn && existingIsbns.has(isbn)) { skipped++; continue; }

        const totalCopies = Math.max(1, Number(row["Quantity"] ?? row.total_copies ?? 1) || 1);

        // Flush before writing if we'd exceed the 500-op batch limit
        if (opsInBatch + 1 + totalCopies > 490) await flushBatch();

        const bookRef = adminDb.collection("library_books").doc();
        currentBatch.set(bookRef, {
          title,
          title_ar: "",
          author: String(row["Author"] ?? row.author ?? "").trim(),
          isbn,
          category: String(row["Genre"] ?? row.category ?? "").trim(),
          language: "English",
          publication_year: null,
          publisher: String(row["Publisher"] ?? row.publisher ?? "").trim(),
          age_group: String(row["Age Group"] ?? row.age_group ?? "").trim(),
          grade_level: String(row["Grade Level"] ?? row.grade_level ?? "").trim(),
          pages: Number(row["# of Pages"] ?? row.pages ?? 0) || null,
          call_number: String(row["Book Number"] ?? row.call_number ?? "").trim(),
          total_copies: totalCopies,
          available_copies: totalCopies,
          cover_url: "",
          created_at: FieldValue.serverTimestamp(),
        });
        opsInBatch++;

        const shelfLocation =
          String(row["Bookshelf Number"] ?? row.location ?? "").trim() || "Main Library";
        for (let ci = 1; ci <= totalCopies; ci++) {
          const copyRef = adminDb.collection("library_copies").doc();
          currentBatch.set(copyRef, {
            book_id: bookRef.id,
            barcode: `KIS-${bookRef.id.slice(0, 6).toUpperCase()}-${String(ci).padStart(3, "0")}`,
            status: "available",
            location: shelfLocation,
            condition: "good",
            created_at: FieldValue.serverTimestamp(),
          });
          opsInBatch++;
        }

        if (isbn) existingIsbns.add(isbn); // deduplicate within the same import
        added++;
      }

      await flushBatch(); // commit any remaining writes

      return NextResponse.json({
        success: true,
        added,
        skipped,
        errors: errors.slice(0, 20),
        message: `${added} book${added !== 1 ? "s" : ""} added, ${skipped} skipped (duplicate ISBN)`,
      });
    }

    // ── Remove Duplicates ──
    if (action === "remove_duplicates") {
      const booksSnap = await adminDb.collection("library_books").get();
      const seen = new Map<string, { id: string; copies: number }>();
      const toDelete: string[] = [];

      for (const doc of booksSnap.docs) {
        const d = doc.data();
        const key = [
          String(d.title ?? "").toLowerCase().trim(),
          String(d.author ?? "").toLowerCase().trim(),
        ].join("|");
        const existing = seen.get(key);
        if (existing) {
          // Keep the one with more copies; delete the other
          if ((d.total_copies ?? 0) > existing.copies) {
            toDelete.push(existing.id);
            seen.set(key, { id: doc.id, copies: d.total_copies ?? 0 });
          } else {
            toDelete.push(doc.id);
          }
        } else {
          seen.set(key, { id: doc.id, copies: d.total_copies ?? 0 });
        }
      }

      if (toDelete.length === 0) {
        return NextResponse.json({ removed: 0, message: "No duplicates found" });
      }

      // Fetch ALL copies in one query and filter in memory (avoids N round-trips)
      const toDeleteSet = new Set(toDelete);
      const allCopiesSnap = await adminDb.collection("library_copies").get();
      const copyRefsToDelete = allCopiesSnap.docs
        .filter((d) => toDeleteSet.has(String(d.data().book_id ?? "")))
        .map((d) => d.ref);

      // Batch-delete copies + book docs (500 ops max per batch)
      const allRefs = [
        ...copyRefsToDelete,
        ...toDelete.map((id) => adminDb.collection("library_books").doc(id)),
      ];
      const BATCH_SIZE = 490;
      for (let i = 0; i < allRefs.length; i += BATCH_SIZE) {
        const deleteBatch = adminDb.batch();
        allRefs.slice(i, i + BATCH_SIZE).forEach((ref) => deleteBatch.delete(ref));
        await deleteBatch.commit();
      }
      const removed = toDelete.length;

      return NextResponse.json({
        removed,
        message: `${removed} duplicate book${removed !== 1 ? "s" : ""} removed`,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("Library POST error:", err);
    return NextResponse.json(
      { error: "Failed to process library request" },
      { status: 500 }
    );
  }
}

/* ── Helper: mark overdue borrowings ──────────────────────────── */
async function markOverdue() {
  // Throttle: skip if already ran within the last 5 minutes
  const now = Date.now();
  if (now - lastMarkOverdueRun < MARK_OVERDUE_INTERVAL_MS) return;
  lastMarkOverdueRun = now;

  const nowIso = new Date().toISOString();
  const snap = await adminDb
    .collection("library_borrowings")
    .where("status", "==", "borrowed")
    .get();

  const batch = adminDb.batch();
  let updated = 0;
  for (const doc of snap.docs) {
    const dueDate = doc.data().due_date;
    if (dueDate && dueDate < nowIso) {
      batch.update(doc.ref, { status: "overdue" });
      updated++;
    }
  }
  if (updated > 0) {
    await batch.commit();
  }
}
