"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookOpen,
  Search,
  Loader2,
  Plus,
  BookCheck,
  Library,
  Clock,
  AlertTriangle,
  RotateCcw,
  Trash2,
  Pencil,
  RefreshCw,
  Ban,
  Settings,
  BarChart3,
  Download,
  ChevronLeft,
  ChevronRight,
  Save,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { useAcademicYear } from "@/context/academic-year-context";
import { useClassNames } from "@/hooks/use-classes";
import { useAuth } from "@/context/auth-context";
import { getDb } from "@/lib/firebase";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LibraryStats {
  total_books: number;
  total_copies: number;
  available_copies: number;
  active_borrowings: number;
  overdue: number;
  lost: number;
  damaged: number;
  total_fines: number;
}

interface Book {
  id: string;
  title: string;
  title_ar: string;
  author: string;
  isbn: string;
  category: string;
  language: string;
  publication_year: number | null;
  publisher: string;
  total_copies: number;
  available_copies: number;
}

interface Borrowing {
  id: string;
  student_number: string;
  student_name: string;
  book_id: string;
  book_title: string;
  book_title_ar: string;
  author: string;
  borrow_date: string;
  due_date: string;
  return_date: string | null;
  status: "borrowed" | "returned" | "overdue" | "lost";
  notes: string;
}

interface LibSettings {
  default_loan_days: number;
  max_books_per_student: number;
  overdue_fine_per_day: number;
  lost_book_fee: number;
  grace_period_days: number;
  categories: string[];
  conditions: string[];
}

interface StudentLookupResult {
  student_number: string;
  student_name: string;
  family_number?: string;
  grade?: string;
  section?: string;
  school?: string;
}

const PAGE_SIZE = 15;

const DEFAULT_LIB_SETTINGS: LibSettings = {
  default_loan_days: 14,
  max_books_per_student: 3,
  overdue_fine_per_day: 0,
  lost_book_fee: 50,
  grace_period_days: 0,
  categories: [],
  conditions: [],
};

function normalizeLibSettings(value: unknown): LibSettings {
  const raw = (value ?? {}) as Partial<LibSettings>;
  return {
    default_loan_days:
      typeof raw.default_loan_days === "number" ? raw.default_loan_days : DEFAULT_LIB_SETTINGS.default_loan_days,
    max_books_per_student:
      typeof raw.max_books_per_student === "number" ? raw.max_books_per_student : DEFAULT_LIB_SETTINGS.max_books_per_student,
    overdue_fine_per_day:
      typeof raw.overdue_fine_per_day === "number" ? raw.overdue_fine_per_day : DEFAULT_LIB_SETTINGS.overdue_fine_per_day,
    lost_book_fee:
      typeof raw.lost_book_fee === "number" ? raw.lost_book_fee : DEFAULT_LIB_SETTINGS.lost_book_fee,
    grace_period_days:
      typeof raw.grace_period_days === "number" ? raw.grace_period_days : DEFAULT_LIB_SETTINGS.grace_period_days,
    categories: Array.isArray(raw.categories)
      ? raw.categories.filter((c): c is string => typeof c === "string")
      : [],
    conditions: Array.isArray(raw.conditions)
      ? raw.conditions.filter((c): c is string => typeof c === "string")
      : [],
  };
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function LibraryPage() {
  const { selectedYear } = useAcademicYear();
  const { assignedMajor } = useAuth();
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [borrowings, setBorrowings] = useState<Borrowing[]>([]);
  const [settings, setSettings] = useState<LibSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "books" | "borrowings" | "reports" | "settings">("overview");

  // Dialogs
  const [addBookOpen, setAddBookOpen] = useState(false);
  const [editBook, setEditBook] = useState<Book | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Book | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // ── Data fetching ──
  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/library?action=stats");
    if (res.ok) {
      const data = await res.json();
      setStats(data);
      if (data.settings) setSettings(normalizeLibSettings(data.settings));
    }
  }, []);

  const fetchBooks = useCallback(async () => {
    const res = await fetch("/api/library?action=books");
    if (res.ok) {
      const data = await res.json();
      setBooks(data.books || []);
    }
  }, []);

  const fetchBorrowings = useCallback(async () => {
    const res = await fetch(
      `/api/library?action=borrowings&status=${statusFilter}`
    );
    if (res.ok) {
      const data = await res.json();
      setBorrowings(data.borrowings || []);
    }
  }, [statusFilter]);

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/library/settings");
    if (res.ok) setSettings(normalizeLibSettings(await res.json()));
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStats(), fetchBooks(), fetchBorrowings(), fetchSettings()]).finally(() =>
      setLoading(false)
    );
  }, [fetchStats, fetchBooks, fetchBorrowings, fetchSettings]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchStats(), fetchBooks(), fetchBorrowings()]);
  }, [fetchStats, fetchBooks, fetchBorrowings]);

  // ── Actions ──
  const handleCheckin = async (borrowingId: string) => {
    const res = await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "checkin", borrowingId }),
    });
    if (res.ok) await refreshAll();
  };

  const handleRenew = async (borrowingId: string) => {
    const res = await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "renew", borrowingId }),
    });
    if (res.ok) await refreshAll();
  };

  const handleMarkLost = async (borrowingId: string) => {
    if (!confirm("Mark this book as lost? A fee will be applied.")) return;
    const res = await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_lost", borrowingId }),
    });
    if (res.ok) await refreshAll();
  };

  const handleDeleteBook = async () => {
    if (!deleteTarget) return;
    const res = await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_book", bookId: deleteTarget.id }),
    });
    if (res.ok) {
      setDeleteTarget(null);
      await Promise.all([fetchStats(), fetchBooks()]);
    }
  };

  // ── CSV export ──
  const exportBorrowingsCSV = () => {
    const headers = ["Student Number", "Student Name", "Book Title", "Author", "Borrowed", "Due", "Returned", "Status"];
    const rows = borrowings.map((b) => [
      b.student_number,
      b.student_name,
      b.book_title,
      b.author,
      b.borrow_date ? new Date(b.borrow_date).toLocaleDateString() : "",
      b.due_date ? new Date(b.due_date).toLocaleDateString() : "",
      b.return_date ? new Date(b.return_date).toLocaleDateString() : "",
      b.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `library-borrowings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Filtered data ──
  const filteredBooks = books.filter(
    (b) =>
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.author.toLowerCase().includes(search.toLowerCase()) ||
      b.isbn.includes(search) ||
      b.title_ar.includes(search)
  );

  const filteredBorrowings = borrowings.filter(
    (b) =>
      b.student_name.toLowerCase().includes(search.toLowerCase()) ||
      b.student_number.includes(search) ||
      b.book_title.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Library className="h-7 w-7" />
            Library Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage books, copies, and student borrowings
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAddBookOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Book
          </Button>
          <Button onClick={() => setCheckoutOpen(true)}>
            <BookOpen className="mr-2 h-4 w-4" />
            Check Out
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-5">
          <KPICard
            title="Total Books"
            value={stats.total_books}
            icon={<BookOpen className="h-5 w-5 text-blue-500" />}
          />
          <KPICard
            title="Total Copies"
            value={stats.total_copies}
            icon={<Library className="h-5 w-5 text-indigo-500" />}
          />
          <KPICard
            title="Available"
            value={stats.available_copies}
            icon={<BookCheck className="h-5 w-5 text-green-500" />}
          />
          <KPICard
            title="Borrowed"
            value={stats.active_borrowings}
            icon={<Clock className="h-5 w-5 text-yellow-500" />}
          />
          <KPICard
            title="Overdue"
            value={stats.overdue}
            icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
            danger={stats.overdue > 0}
          />
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-2 border-b pb-2">
        {(
          [
            ["overview", "Overview"],
            ["books", "Book Catalog"],
            ["borrowings", "Borrowings"],
            ["reports", "Reports"],
            ["settings", "Settings"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            variant={tab === key ? "default" : "ghost"}
            size="sm"
            onClick={() => setTab(key)}
          >
            {key === "reports" && <BarChart3 className="mr-1 h-4 w-4" />}
            {key === "settings" && <Settings className="mr-1 h-4 w-4" />}
            {label}
          </Button>
        ))}
      </div>

      {/* ── Search bar (not on reports/settings) ── */}
      {(tab === "overview" || tab === "books" || tab === "borrowings") && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={
              tab === "books"
                ? "Search by title, author, ISBN…"
                : "Search by student, book…"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* ── Tab Content ── */}
      {tab === "overview" && (
        <OverviewTab borrowings={borrowings} onCheckin={handleCheckin} onRenew={handleRenew} onMarkLost={handleMarkLost} />
      )}
      {tab === "books" && (
        <BooksTab books={filteredBooks} onDelete={setDeleteTarget} onEdit={setEditBook} />
      )}
      {tab === "borrowings" && (
        <BorrowingsTab
          borrowings={filteredBorrowings}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          onCheckin={handleCheckin}
          onRenew={handleRenew}
          onMarkLost={handleMarkLost}
          onExport={exportBorrowingsCSV}
        />
      )}
      {tab === "reports" && <ReportsTab />}
      {tab === "settings" && settings && (
        <SettingsTab settings={settings} onSave={async () => { await fetchSettings(); await fetchStats(); }} />
      )}

      {/* ── Dialogs ── */}
      <AddBookDialog
        open={addBookOpen}
        onClose={() => setAddBookOpen(false)}
        categories={settings?.categories || []}
        onSuccess={async () => {
          setAddBookOpen(false);
          await Promise.all([fetchStats(), fetchBooks()]);
        }}
      />
      <EditBookDialog
        book={editBook}
        onClose={() => setEditBook(null)}
        categories={settings?.categories || []}
        onSuccess={async () => {
          setEditBook(null);
          await fetchBooks();
        }}
      />
      <CheckoutDialog
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        books={books.filter((b) => b.available_copies > 0)}
        selectedYear={selectedYear}
        assignedMajor={assignedMajor}
        onSuccess={async () => {
          setCheckoutOpen(false);
          await refreshAll();
        }}
      />
      <Dialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Book</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.title}&quot;?
              This will also remove all copies. Active borrowings will prevent
              deletion.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteBook}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ================================================================== */
/*  Sub-components                                                     */
/* ================================================================== */

function KPICard({
  title,
  value,
  icon,
  danger,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="rounded-lg bg-muted p-2">{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p
            className={`text-2xl font-bold ${danger ? "text-red-500" : ""}`}
          >
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Pagination helper ── */
function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-4">
      <span className="text-sm text-muted-foreground">
        Page {page} of {totalPages} ({total} records)
      </span>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ── Borrowing action buttons ── */
function BorrowingActions({
  b,
  onCheckin,
  onRenew,
  onMarkLost,
}: {
  b: Borrowing;
  onCheckin: (id: string) => void;
  onRenew: (id: string) => void;
  onMarkLost: (id: string) => void;
}) {
  if (b.status === "returned" || b.status === "lost") return null;
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="outline" onClick={() => onCheckin(b.id)} title="Return">
        <RotateCcw className="mr-1 h-3 w-3" /> Return
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onRenew(b.id)} title="Renew (extend due date)">
        <RefreshCw className="h-3 w-3" />
      </Button>
      <Button size="sm" variant="ghost" className="text-red-500" onClick={() => onMarkLost(b.id)} title="Mark Lost">
        <Ban className="h-3 w-3" />
      </Button>
    </div>
  );
}

/* ── Overview Tab ── */
function OverviewTab({
  borrowings,
  onCheckin,
  onRenew,
  onMarkLost,
}: {
  borrowings: Borrowing[];
  onCheckin: (id: string) => void;
  onRenew: (id: string) => void;
  onMarkLost: (id: string) => void;
}) {
  const active = borrowings.filter(
    (b) => b.status === "borrowed" || b.status === "overdue"
  );
  const overdue = borrowings.filter((b) => b.status === "overdue");
  const recent = borrowings
    .filter((b) => b.status === "returned")
    .slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Overdue alert */}
      {overdue.length > 0 && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-red-500 flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5" />
              {overdue.length} Overdue Book{overdue.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Book</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Days Overdue</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overdue.map((b) => {
                  const days = Math.ceil(
                    (Date.now() - new Date(b.due_date).getTime()) /
                      86400000
                  );
                  return (
                    <TableRow key={b.id}>
                      <TableCell>
                        <span className="font-medium">{b.student_name}</span>
                        <br />
                        <span className="text-xs text-muted-foreground">
                          #{b.student_number}
                        </span>
                      </TableCell>
                      <TableCell>{b.book_title}</TableCell>
                      <TableCell>
                        {new Date(b.due_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive">{days} days</Badge>
                      </TableCell>
                      <TableCell>
                        <BorrowingActions b={b} onCheckin={onCheckin} onRenew={onRenew} onMarkLost={onMarkLost} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Currently borrowed */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Currently Borrowed ({active.length})
          </CardTitle>
          <CardDescription>Books currently checked out by students</CardDescription>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No active borrowings
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Book</TableHead>
                  <TableHead>Borrowed</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <span className="font-medium">{b.student_name}</span>
                      <br />
                      <span className="text-xs text-muted-foreground">
                        #{b.student_number}
                      </span>
                    </TableCell>
                    <TableCell>
                      {b.book_title}
                      {b.author && (
                        <span className="text-xs text-muted-foreground block">
                          by {b.author}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(b.borrow_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {new Date(b.due_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          b.status === "overdue" ? "destructive" : "secondary"
                        }
                      >
                        {b.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <BorrowingActions b={b} onCheckin={onCheckin} onRenew={onRenew} onMarkLost={onMarkLost} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent returns */}
      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Returns</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Book</TableHead>
                  <TableHead>Returned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>{b.student_name}</TableCell>
                    <TableCell>{b.book_title}</TableCell>
                    <TableCell>
                      {b.return_date
                        ? new Date(b.return_date).toLocaleDateString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Books Tab (with pagination) ── */
function BooksTab({
  books,
  onDelete,
  onEdit,
}: {
  books: Book[];
  onDelete: (b: Book) => void;
  onEdit: (b: Book) => void;
}) {
  const [page, setPage] = useState(1);
  const paged = books.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Book Catalog ({books.length})</CardTitle>
        <CardDescription>All books in the library collection</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>ISBN</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>Copies</TableHead>
              <TableHead>Available</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  <span className="font-medium">{b.title}</span>
                  {b.title_ar && b.title_ar !== b.title && (
                    <span className="block text-xs text-muted-foreground">
                      {b.title_ar}
                    </span>
                  )}
                </TableCell>
                <TableCell>{b.author}</TableCell>
                <TableCell className="text-xs font-mono">{b.isbn}</TableCell>
                <TableCell>
                  <Badge variant="outline">{b.category || "—"}</Badge>
                </TableCell>
                <TableCell>{b.language}</TableCell>
                <TableCell>{b.total_copies}</TableCell>
                <TableCell>
                  <Badge
                    variant={b.available_copies > 0 ? "secondary" : "destructive"}
                  >
                    {b.available_copies}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onEdit(b)}
                      title="Edit book"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => onDelete(b)}
                      title="Delete book"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {books.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No books found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <Pagination page={page} total={books.length} onChange={setPage} />
      </CardContent>
    </Card>
  );
}

/* ── Borrowings Tab (with pagination + export) ── */
function BorrowingsTab({
  borrowings,
  statusFilter,
  setStatusFilter,
  onCheckin,
  onRenew,
  onMarkLost,
  onExport,
}: {
  borrowings: Borrowing[];
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  onCheckin: (id: string) => void;
  onRenew: (id: string) => void;
  onMarkLost: (id: string) => void;
  onExport: () => void;
}) {
  const [page, setPage] = useState(1);
  const paged = borrowings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="borrowed">Borrowed</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="returned">Returned</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {borrowings.length} records
        </span>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Book</TableHead>
                <TableHead>Borrowed</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Returned</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <span className="font-medium">{b.student_name}</span>
                    <br />
                    <span className="text-xs text-muted-foreground">
                      #{b.student_number}
                    </span>
                  </TableCell>
                  <TableCell>{b.book_title}</TableCell>
                  <TableCell>
                    {new Date(b.borrow_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {new Date(b.due_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {b.return_date
                      ? new Date(b.return_date).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        b.status === "overdue" || b.status === "lost"
                          ? "destructive"
                          : b.status === "returned"
                            ? "secondary"
                            : "default"
                      }
                    >
                      {b.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <BorrowingActions b={b} onCheckin={onCheckin} onRenew={onRenew} onMarkLost={onMarkLost} />
                  </TableCell>
                </TableRow>
              ))}
              {borrowings.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No borrowing records found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="px-4 pb-2">
            <Pagination page={page} total={borrowings.length} onChange={setPage} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Reports Tab ── */
function ReportsTab() {
  const [reportType, setReportType] = useState("most_borrowed");
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReport = useCallback(async (type: string) => {
    setLoading(true);
    const res = await fetch(`/api/library?action=reports&type=${type}`);
    if (res.ok) {
      const json = await res.json();
      setData(json.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchReport(reportType);
  }, [reportType, fetchReport]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {[
          ["most_borrowed", "Most Borrowed"],
          ["top_readers", "Top Readers"],
          ["by_category", "By Category"],
          ["monthly_trend", "Monthly Trend"],
          ["overdue_detail", "Overdue Detail"],
        ].map(([key, label]) => (
          <Button
            key={key}
            variant={reportType === key ? "default" : "outline"}
            size="sm"
            onClick={() => setReportType(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            {data.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data available for this report.</p>
            ) : reportType === "most_borrowed" ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Book Title</TableHead>
                    <TableHead>Times Borrowed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">{String(r.title || "")}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{String(r.borrowCount || 0)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : reportType === "top_readers" ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Student Number</TableHead>
                    <TableHead>Books Read</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">{String(r.studentName || "")}</TableCell>
                      <TableCell className="text-xs font-mono">{String(r.studentNumber || "")}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{String(r.borrowCount || 0)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : reportType === "by_category" ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Total Copies</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead>Total Borrows</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{String(r.category || "")}</TableCell>
                      <TableCell>{String(r.totalCopies || 0)}</TableCell>
                      <TableCell>{String(r.availableCopies || 0)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{String(r.totalBorrows || 0)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : reportType === "monthly_trend" ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Borrowed</TableHead>
                    <TableHead>Returned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{String(r.month || "")}</TableCell>
                      <TableCell>{String(r.borrowed || 0)}</TableCell>
                      <TableCell>{String(r.returned || 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : reportType === "overdue_detail" ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Book</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Days Overdue</TableHead>
                    <TableHead>Fine (SAR)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <span className="font-medium">{String(r.student_name || "")}</span>
                        <br />
                        <span className="text-xs text-muted-foreground">#{String(r.student_number || "")}</span>
                      </TableCell>
                      <TableCell>{String(r.book_title || "")}</TableCell>
                      <TableCell>{r.due_date ? new Date(String(r.due_date)).toLocaleDateString() : ""}</TableCell>
                      <TableCell>
                        <Badge variant="destructive">{String(r.overdue_days || 0)} days</Badge>
                      </TableCell>
                      <TableCell>{String(r.fine || 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Settings Tab ── */
function SettingsTab({ settings, onSave }: { settings: LibSettings; onSave: () => void }) {
  const [form, setForm] = useState<LibSettings>(normalizeLibSettings(settings));
  const [saving, setSaving] = useState(false);
  const [newCat, setNewCat] = useState("");

  useEffect(() => {
    setForm(normalizeLibSettings(settings));
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch("/api/library/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) onSave();
  };

  const addCategory = () => {
    const trimmed = newCat.trim();
    if (trimmed && !form.categories.includes(trimmed)) {
      setForm({ ...form, categories: [...form.categories, trimmed] });
      setNewCat("");
    }
  };

  const removeCategory = (cat: string) => {
    setForm({ ...form, categories: form.categories.filter((c) => c !== cat) });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-5 w-5" /> Library Settings
          </CardTitle>
          <CardDescription>Configure loan periods, limits, and fines</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Default Loan Days</Label>
              <Input
                type="number"
                min={1}
                value={form.default_loan_days}
                onChange={(e) => setForm({ ...form, default_loan_days: parseInt(e.target.value) || 14 })}
              />
            </div>
            <div>
              <Label>Max Books per Student</Label>
              <Input
                type="number"
                min={1}
                value={form.max_books_per_student}
                onChange={(e) => setForm({ ...form, max_books_per_student: parseInt(e.target.value) || 3 })}
              />
            </div>
            <div>
              <Label>Overdue Fine per Day (SAR)</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={form.overdue_fine_per_day}
                onChange={(e) => setForm({ ...form, overdue_fine_per_day: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Lost Book Fee (SAR)</Label>
              <Input
                type="number"
                min={0}
                value={form.lost_book_fee}
                onChange={(e) => setForm({ ...form, lost_book_fee: parseFloat(e.target.value) || 50 })}
              />
            </div>
            <div>
              <Label>Grace Period Days</Label>
              <Input
                type="number"
                min={0}
                value={form.grace_period_days}
                onChange={(e) => setForm({ ...form, grace_period_days: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          {/* Categories manager */}
          <div>
            <Label>Book Categories</Label>
            <div className="flex flex-wrap gap-2 mt-2 mb-2">
              {form.categories.map((cat) => (
                <Badge key={cat} variant="outline" className="gap-1 pr-1">
                  {cat}
                  <button
                    className="ml-1 text-red-400 hover:text-red-600"
                    onClick={() => removeCategory(cat)}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                placeholder="New category…"
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
                className="max-w-xs"
              />
              <Button variant="outline" size="sm" onClick={addCategory}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Add Book Dialog (with category dropdown) ── */
function AddBookDialog({
  open,
  onClose,
  categories,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  categories: string[];
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    title: "",
    title_ar: "",
    author: "",
    isbn: "",
    category: "",
    language: "English",
    publication_year: "",
    publisher: "",
    total_copies: "1",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.title) return;
    setSaving(true);
    const res = await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add_book",
        ...form,
        publication_year: form.publication_year
          ? parseInt(form.publication_year)
          : null,
        total_copies: parseInt(form.total_copies) || 1,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setForm({
        title: "",
        title_ar: "",
        author: "",
        isbn: "",
        category: "",
        language: "English",
        publication_year: "",
        publisher: "",
        total_copies: "1",
      });
      onSuccess();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Book</DialogTitle>
          <DialogDescription>
            Add a book to the library catalog with copies.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Book title"
              />
            </div>
            <div>
              <Label>Title (Arabic)</Label>
              <Input
                value={form.title_ar}
                onChange={(e) => setForm({ ...form, title_ar: e.target.value })}
                placeholder="العنوان"
                dir="rtl"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Author</Label>
              <Input
                value={form.author}
                onChange={(e) => setForm({ ...form, author: e.target.value })}
                placeholder="Author name"
              />
            </div>
            <div>
              <Label>ISBN</Label>
              <Input
                value={form.isbn}
                onChange={(e) => setForm({ ...form, isbn: e.target.value })}
                placeholder="978-…"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Category</Label>
              {categories.length > 0 ? (
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Fiction, Science…"
                />
              )}
            </div>
            <div>
              <Label>Language</Label>
              <Select
                value={form.language}
                onValueChange={(v: string) => setForm({ ...form, language: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Arabic">Arabic</SelectItem>
                  <SelectItem value="French">French</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Year</Label>
              <Input
                value={form.publication_year}
                onChange={(e) =>
                  setForm({ ...form, publication_year: e.target.value })
                }
                placeholder="2024"
                type="number"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Publisher</Label>
              <Input
                value={form.publisher}
                onChange={(e) =>
                  setForm({ ...form, publisher: e.target.value })
                }
                placeholder="Publisher name"
              />
            </div>
            <div>
              <Label>Number of Copies</Label>
              <Input
                value={form.total_copies}
                onChange={(e) =>
                  setForm({ ...form, total_copies: e.target.value })
                }
                type="number"
                min="1"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !form.title}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add Book
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Edit Book Dialog ── */
function EditBookDialog({
  book,
  onClose,
  categories,
  onSuccess,
}: {
  book: Book | null;
  onClose: () => void;
  categories: string[];
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    title: "",
    title_ar: "",
    author: "",
    isbn: "",
    category: "",
    language: "English",
    publication_year: "",
    publisher: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (book) {
      setForm({
        title: book.title,
        title_ar: book.title_ar,
        author: book.author,
        isbn: book.isbn,
        category: book.category,
        language: book.language,
        publication_year: book.publication_year ? String(book.publication_year) : "",
        publisher: book.publisher,
      });
    }
  }, [book]);

  const handleSubmit = async () => {
    if (!book || !form.title) return;
    setSaving(true);
    const res = await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_book",
        bookId: book.id,
        ...form,
        publication_year: form.publication_year ? parseInt(form.publication_year) : null,
      }),
    });
    setSaving(false);
    if (res.ok) onSuccess();
  };

  return (
    <Dialog open={!!book} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Book</DialogTitle>
          <DialogDescription>Update book details.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Title (Arabic)</Label>
              <Input value={form.title_ar} onChange={(e) => setForm({ ...form, title_ar: e.target.value })} dir="rtl" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Author</Label>
              <Input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
            </div>
            <div>
              <Label>ISBN</Label>
              <Input value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Category</Label>
              {categories.length > 0 ? (
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              )}
            </div>
            <div>
              <Label>Language</Label>
              <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Arabic">Arabic</SelectItem>
                  <SelectItem value="French">French</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Year</Label>
              <Input value={form.publication_year} onChange={(e) => setForm({ ...form, publication_year: e.target.value })} type="number" />
            </div>
          </div>
          <div>
            <Label>Publisher</Label>
            <Input value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !form.title}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Checkout Dialog (with book search) ── */
function CheckoutDialog({
  open,
  onClose,
  books,
  onSuccess,
  selectedYear,
  assignedMajor,
}: {
  open: boolean;
  onClose: () => void;
  books: Book[];
  onSuccess: () => void;
  selectedYear: string | null;
  assignedMajor: string | null;
  assignedMajor: string | null;
}) {
  const [studentQuery, setStudentQuery] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentResults, setStudentResults] = useState<StudentLookupResult[]>([]);
  const [filterClass, setFilterClass] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [studentLookupError, setStudentLookupError] = useState<string | null>(null);
  const [bookId, setBookId] = useState("");
  const [bookSearch, setBookSearch] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split("T")[0];
  });
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  // Browse-by-class state
  const [browseClasses, setBrowseClasses] = useState<{ cls: string; sections: string[] }[]>([]);
  const [browseClass, setBrowseClass] = useState("");
  const [browseSection, setBrowseSection] = useState("");
  const [browseLoading, setBrowseLoading] = useState(false);
  const { classNameMap } = useClassNames();
  const [classSections, setClassSections] = useState<
    { classCode: string; sectionCode: string; sectionName: string }[]
  >([]);

  useEffect(() => {
    if (!open || !selectedYear) return;
    let cancelled = false;

    void (async () => {
      try {
        const constraints = [where("Academic_Year", "==", selectedYear)];
        if (assignedMajor) {
          constraints.push(where("Major_Code", "==", assignedMajor));
        }

        const snap = await getDocs(query(collection(getDb(), "sections"), ...constraints));
        if (cancelled) return;

        const items: { classCode: string; sectionCode: string; sectionName: string }[] = [];
        snap.docs.forEach((doc) => {
          const data = doc.data();
          const classCode = String(data.Class_Code || "");
          const sectionCode = String(data.Section_Code || "");
          if (!classCode || !sectionCode) return;
          items.push({
            classCode,
            sectionCode,
            sectionName: String(data.E_Section_Name || data.Section_Code),
          });
        });

        setClassSections(items);
      } catch (err) {
        console.error("Failed to load section names:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, selectedYear, assignedMajor]);

  const sectionNameMap = useMemo(
    () =>
      classSections.reduce<Record<string, string>>((acc, item) => {
        acc[`${item.classCode}__${item.sectionCode}`] = item.sectionName;
        return acc;
      }, {}),
    [classSections]
  );

  // Load available classes when dialog opens
  useEffect(() => {
    if (!open || !selectedYear) return;
    void (async () => {
      const res = await fetch("/api/student-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "browse_options", year: selectedYear, school: assignedMajor || undefined }),
      }).catch(() => null);
      if (!res?.ok) return;
      const data = await res.json() as { classes?: { cls: string; sections: string[] }[] };
      setBrowseClasses(data.classes ?? []);
    })();
  }, [open, selectedYear, assignedMajor]);

  // When class or section browse changes, fetch students
  useEffect(() => {
    if (!browseClass || !selectedYear) {
      if (!browseClass) setStudentResults([]);
      return;
    }
    void (async () => {
      setBrowseLoading(true);
      setStudentQuery("");
      setStudentNumber("");
      setStudentName("");
      setStudentLookupError(null);
      const res = await fetch("/api/student-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "browse",
          classCode: browseClass,
          sectionCode: browseSection || "all",
          year: selectedYear,
          school: assignedMajor || "all",
          limit: 200,
        }),
      }).catch(() => null);
      if (res?.ok) {
        const data = await res.json() as { results?: StudentLookupResult[] };
        setStudentResults(
          (data.results ?? []).map((s) => ({
            student_number: s.student_number,
            student_name: s.student_name,
            grade: (s as { latest_class?: string }).latest_class ?? "",
            section: (s as { latest_section?: string }).latest_section ?? "",
          }))
        );
      }
      setBrowseLoading(false);
    })();
  }, [browseClass, browseSection, selectedYear]);

  const browseSections = useMemo(
    () => browseClasses.find((c) => c.cls === browseClass)?.sections ?? [],
    [browseClasses, browseClass]
  );

  const filteredBooks = useMemo(
    () =>
      bookSearch
        ? books.filter(
            (b) =>
              b.title.toLowerCase().includes(bookSearch.toLowerCase()) ||
              b.author.toLowerCase().includes(bookSearch.toLowerCase()) ||
              b.isbn.includes(bookSearch)
          )
        : books,
    [books, bookSearch]
  );

  // Derive unique class/section options from name-search results (when not browsing)
  const classOptions = useMemo(() => {
    if (browseClass) return []; // hide name-search filters when browsing
    const set = new Set<string>();
    for (const s of studentResults) if (s.grade) set.add(s.grade);
    return Array.from(set).sort();
  }, [studentResults]);

  const sectionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of studentResults)
      if (s.section && (!filterClass || s.grade === filterClass)) set.add(s.section);
    return Array.from(set).sort();
  }, [studentResults, filterClass]);

  const filteredStudentResults = useMemo(() => {
    return studentResults.filter(
      (s) =>
        (!filterClass || s.grade === filterClass) &&
        (!filterSection || s.section === filterSection)
    );
  }, [studentResults, filterClass, filterSection]);

  const lookupStudent = async () => {
    const query = studentQuery.trim();
    if (query.length < 2) {
      setStudentLookupError("Enter at least 2 characters to search.");
      setStudentResults([]);
      setFilterClass("");
      setFilterSection("");
      return;
    }

    setLookingUp(true);
    setStudentLookupError(null);
    setFilterClass("");
    setFilterSection("");
    try {
      if (/^\d+$/.test(query) || /^\d{4}-\d+$/.test(query) || /^0021-/.test(query)) {
        const exactRes = await fetch(
          `/api/student-progress?studentNumber=${encodeURIComponent(query)}`
        );

        if (exactRes.ok) {
          const exactData = await exactRes.json();
          const student = {
            student_number: exactData.data?.student_number || query,
            student_name:
              exactData.data?.student_name || exactData.data?.student_name_ar || "",
            grade: "",
            section: "",
            school: "",
          } satisfies StudentLookupResult;

          setStudentResults([student]);
          setStudentNumber(student.student_number);
          setStudentName(student.student_name || "");
          setStudentQuery(`${student.student_name} (${student.student_number})`);
          setLookingUp(false);
          return;
        }
      }

      const res = await fetch("/api/student-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 8 }),
      });

      if (res.ok) {
        const data = await res.json();
        const results = Array.isArray(data.results)
          ? (data.results as StudentLookupResult[])
          : [];
        setStudentResults(results);

        if (results.length === 1) {
          const student = results[0];
          setStudentNumber(student.student_number);
          setStudentName(student.student_name || "");
          setStudentQuery(`${student.student_name} (${student.student_number})`);
        } else {
          setStudentNumber("");
          setStudentName("");
        }

        if (results.length === 0) {
          setStudentLookupError("No students matched your search.");
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setStudentResults([]);
        setStudentLookupError(data.error || "Student lookup failed.");
      }
    } catch {
      setStudentResults([]);
      setStudentLookupError("Student lookup failed.");
    }
    setLookingUp(false);
  };

  const selectStudent = (student: StudentLookupResult) => {
    setStudentNumber(student.student_number);
    setStudentName(student.student_name || "");
    setStudentQuery(`${student.student_name} (${student.student_number})`);
    setStudentResults([]);
    setStudentLookupError(null);
  };

  const handleSubmit = async () => {
    if (!studentNumber || !studentName || !bookId || !dueDate) return;
    setSaving(true);
    setStudentLookupError(null);
    const res = await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "checkout",
        studentNumber: studentNumber.trim(),
        studentName,
        bookId,
        dueDate: new Date(dueDate).toISOString(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      setStudentQuery("");
      setStudentNumber("");
      setStudentName("");
      setStudentResults([]);
      setBookId("");
      setBookSearch("");
      onSuccess();
      return;
    }

    setStudentLookupError(data.error || "Failed to check out book.");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Check Out Book</DialogTitle>
          <DialogDescription>
            Issue a book to a student.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label>Student *</Label>

            {/* Browse by class / section */}
            <div className="mb-2 flex gap-2">
              <select
                className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                value={browseClass}
                onChange={(e) => {
                  setBrowseClass(e.target.value);
                  setBrowseSection("");
                  setStudentNumber("");
                  setStudentName("");
                }}
              >
                <option value="">— Browse by Class —</option>
                {browseClasses.map((c) => (
                  <option key={c.cls} value={c.cls}>{classNameMap[c.cls] || c.cls}</option>
                ))}
              </select>
              {browseClass && browseSections.length > 0 && (
                <select
                  className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                  value={browseSection}
                  onChange={(e) => {
                    setBrowseSection(e.target.value);
                    setStudentNumber("");
                    setStudentName("");
                  }}
                >
                  <option value="">All Sections</option>
                  {browseSections.map((s) => (
                    <option key={s} value={s}>{sectionNameMap[`${browseClass}__${s}`] || s}</option>
                  ))}
                </select>
              )}
              {browseLoading && <Loader2 className="h-4 w-4 animate-spin self-center" />}
            </div>

            {/* Name / number search */}
            <div className="flex gap-2">
              <Input
                value={studentQuery}
                onChange={(e) => {
                  setStudentQuery(e.target.value);
                  setStudentNumber("");
                  setStudentName("");
                  setStudentLookupError(null);
                  setFilterClass("");
                  setFilterSection("");
                  if (e.target.value === "") setBrowseClass(""); // clear browse when search cleared
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void lookupStudent();
                  }
                }}
                placeholder="Search by student number or name"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={lookupStudent}
                disabled={lookingUp}
              >
                {lookingUp ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
            {studentLookupError && (
              <p className="mt-1 text-sm text-destructive">{studentLookupError}</p>
            )}
            {studentResults.length > 0 && classOptions.length > 1 && (
              <div className="mt-2 flex gap-2">
                <select
                  className="flex-1 rounded-md border bg-background px-2 py-1 text-sm"
                  value={filterClass}
                  onChange={(e) => { setFilterClass(e.target.value); setFilterSection(""); }}
                >
                  <option value="">All Classes</option>
                  {classOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                {sectionOptions.length > 1 && (
                  <select
                    className="flex-1 rounded-md border bg-background px-2 py-1 text-sm"
                    value={filterSection}
                    onChange={(e) => setFilterSection(e.target.value)}
                  >
                    <option value="">All Sections</option>
                    {sectionOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
            )}
            {filteredStudentResults.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-md border">
                {filteredStudentResults.map((student) => (
                  <button
                    key={student.student_number}
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
                    onClick={() => selectStudent(student)}
                  >
                    <span className="font-medium">{student.student_name || student.student_number}</span>
                    <span className="text-xs text-muted-foreground">
                      {student.student_number}
                      {student.grade ? ` · ${student.grade}` : ""}
                      {student.section
                        ? ` · ${sectionNameMap[`${student.grade || ""}__${student.section}`] || student.section}`
                        : ""}
                      {student.school ? ` · ${student.school}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {studentName && (
              <div className="mt-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{studentName}</span>
                <span className="ml-2 font-mono">{studentNumber}</span>
              </div>
            )}
          </div>
          <div>
            <Label>Book *</Label>
            <Input
              placeholder="Search by title, author, ISBN…"
              value={bookSearch}
              onChange={(e) => setBookSearch(e.target.value)}
              className="mb-2"
            />
            <Select value={bookId} onValueChange={setBookId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a book" />
              </SelectTrigger>
              <SelectContent>
                {filteredBooks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.title} ({b.available_copies} avail.)
                  </SelectItem>
                ))}
                {filteredBooks.length === 0 && (
                  <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                    No matching books
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Due Date *</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !studentNumber || !studentName || !bookId || !dueDate}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Check Out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
