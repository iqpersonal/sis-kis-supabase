import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { auth } from "@/lib/firebase";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";
import BarcodeScanner from "@/components/BarcodeScanner";

const LIB_API = "https://sis-kis.web.app/api/library";

// Cache the Firebase ID token for up to 50 minutes to avoid re-fetching on every request
let _cachedToken: string | null = null;
let _tokenExpiry = 0;
async function getToken(): Promise<string | null> {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;
  _cachedToken = (await auth.currentUser?.getIdToken()) ?? null;
  _tokenExpiry = Date.now() + 50 * 60 * 1000; // tokens are valid for 1h, refresh at 50min
  return _cachedToken;
}

/* ── Types ────────────────────────────────────────────────────── */
interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string;
  category: string;
  publisher: string;
  publication_year: number | null;
  total_copies: number;
  available_copies: number;
  cover_url?: string;
}

interface Copy {
  id: string;
  barcode: string;
  status: "available" | "borrowed" | "overdue" | "lost";
  condition: string;
  book_id: string;
}

interface Borrowing {
  id: string;
  student_number: string;
  student_name: string;
  book_id: string;
  book_title: string;
  author: string;
  borrow_date: string;
  due_date: string;
  status: "borrowed" | "overdue";
}

interface LookupResult {
  copy: Copy;
  book: Book;
  active_borrowing: Borrowing | null;
}

/* ── Helpers ───────────────────────────────────────────────────── */
async function apiGet(path: string) {
  const token = await getToken();
  return fetch(`${LIB_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function apiPost(body: Record<string, unknown>) {
  const token = await getToken();
  return fetch(LIB_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

function daysOverdue(dueDate: string): number {
  const now = new Date();
  const due = new Date(dueDate);
  return Math.max(0, Math.floor((now.getTime() - due.getTime()) / 86400000));
}

/* ── Main Screen ───────────────────────────────────────────────── */
type Tab = "scan" | "search" | "overdue" | "add";

export default function LibraryScreen() {
  const [tab, setTab] = useState<Tab>("scan");

  return (
    <SafeAreaView style={commonStyles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="book" size={24} color={colors.accent} />
        <Text style={styles.headerTitle}>Library</Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(
          [
            { id: "scan", icon: "barcode-outline", label: "Scan" },
            { id: "search", icon: "search-outline", label: "Search" },
            { id: "overdue", icon: "alert-circle-outline", label: "Overdue" },
            { id: "add", icon: "add-circle-outline", label: "Add Book" },
          ] as const
        ).map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tabItem, tab === t.id && styles.tabItemActive]}
            onPress={() => setTab(t.id)}
          >
            <Ionicons
              name={t.icon}
              size={20}
              color={tab === t.id ? colors.accent : colors.textMuted}
            />
            <Text style={[styles.tabLabel, tab === t.id && styles.tabLabelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {tab === "scan" && <ScanTab />}
        {tab === "search" && <SearchTab />}
        {tab === "overdue" && <OverdueTab />}
        {tab === "add" && <AddBookTab />}
      </View>
    </SafeAreaView>
  );
}

/* ── Scan Tab ──────────────────────────────────────────────────── */
function ScanTab() {
  const [scannerVisible, setScannerVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState("");

  // Checkout form
  const [studentNumber, setStudentNumber] = useState("");
  const [studentName, setStudentName] = useState("");
  const [lookingUpStudent, setLookingUpStudent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setResult(null);
    setError("");
    setStudentNumber("");
    setStudentName("");
  };

  const handleScanned = async (barcode: string) => {
    setScannerVisible(false);
    setLoading(true);
    setResult(null);
    setError("");
    try {
      const res = await apiGet(`?action=lookup_copy&barcode=${encodeURIComponent(barcode)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Barcode not recognised");
      } else {
        setResult(data as LookupResult);
      }
    } catch {
      setError("Network error — check your connection");
    } finally {
      setLoading(false);
    }
  };

  const lookupStudent = async (num: string) => {
    if (!num.trim()) return;
    setLookingUpStudent(true);
    try {
      const res = await apiGet(`?action=student&studentNumber=${encodeURIComponent(num.trim())}`);
      const data = await res.json();
      const b = data.borrowings?.[0] ?? data.student;
      if (b?.student_name) setStudentName(b.student_name);
      else if (data.student_name) setStudentName(data.student_name);
    } catch { /* ignore */ }
    setLookingUpStudent(false);
  };

  const handleCheckout = async () => {
    if (!result || !studentNumber.trim()) {
      Alert.alert("Required", "Please enter the student number");
      return;
    }
    setSubmitting(true);
    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);
      const res = await apiPost({
        action: "checkout",
        bookId: result.book.id,
        copyId: result.copy.id,
        studentNumber: studentNumber.trim(),
        studentName: studentName.trim() || studentNumber.trim(),
        dueDate: dueDate.toISOString().split("T")[0],
      });
      const data = await res.json();
      if (res.ok && data.success) {
        Alert.alert("✓ Checked Out", `"${result.book.title}" is now checked out to ${studentName || studentNumber}`, [
          { text: "Done", onPress: reset },
        ]);
      } else {
        Alert.alert("Error", data.error ?? "Checkout failed");
      }
    } catch {
      Alert.alert("Error", "Network error");
    }
    setSubmitting(false);
  };

  const handleCheckin = async () => {
    if (!result?.active_borrowing) return;
    Alert.alert(
      "Confirm Check In",
      `Return "${result.book.title}" from ${result.active_borrowing.student_name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Check In",
          onPress: async () => {
            setSubmitting(true);
            try {
              const res = await apiPost({
                action: "checkin",
                borrowingId: result.active_borrowing!.id,
                condition: "good",
              });
              const data = await res.json();
              if (res.ok && data.success) {
                Alert.alert("✓ Returned", `"${result.book.title}" returned successfully`, [
                  { text: "Done", onPress: reset },
                ]);
              } else {
                Alert.alert("Error", data.error ?? "Check-in failed");
              }
            } catch {
              Alert.alert("Error", "Network error");
            }
            setSubmitting(false);
          },
        },
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.tabContent} keyboardShouldPersistTaps="handled">
      {/* Scan button */}
      <TouchableOpacity style={styles.scanBtn} onPress={() => setScannerVisible(true)}>
        <Ionicons name="barcode-outline" size={32} color={colors.accent} />
        <Text style={styles.scanBtnText}>Scan Book Barcode</Text>
        <Text style={styles.scanBtnSub}>Point camera at the KIS library barcode sticker</Text>
      </TouchableOpacity>

      {loading && (
        <View style={styles.centeredBlock}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.mutedText}>Looking up barcode…</Text>
        </View>
      )}

      {error !== "" && !loading && (
        <View style={styles.errorCard}>
          <Ionicons name="warning-outline" size={20} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setScannerVisible(true)} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {result && !loading && (
        <View style={styles.resultCard}>
          {/* Book info */}
          <View style={styles.resultBookRow}>
            <View style={styles.bookIconBox}>
              <Ionicons name="book" size={28} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultTitle}>{result.book.title}</Text>
              {result.book.author ? (
                <Text style={styles.resultSub}>by {result.book.author}</Text>
              ) : null}
              <Text style={styles.resultSub}>Barcode: {result.copy.barcode}</Text>
            </View>
          </View>

          {/* Status badge */}
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: result.copy.status === "available" ? colors.success + "22" : colors.danger + "22" }]}>
              <Ionicons
                name={result.copy.status === "available" ? "checkmark-circle" : "close-circle"}
                size={14}
                color={result.copy.status === "available" ? colors.success : colors.danger}
              />
              <Text style={[styles.statusText, { color: result.copy.status === "available" ? colors.success : colors.danger }]}>
                {result.copy.status === "available" ? "Available" : result.copy.status.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Available → checkout form */}
          {result.copy.status === "available" && (
            <View style={styles.actionSection}>
              <Text style={styles.sectionLabel}>Check Out To</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Student number"
                  placeholderTextColor={colors.textMuted}
                  value={studentNumber}
                  onChangeText={setStudentNumber}
                  onBlur={() => lookupStudent(studentNumber)}
                  keyboardType="numeric"
                  returnKeyType="done"
                />
                {lookingUpStudent && <ActivityIndicator size="small" color={colors.accent} style={{ marginLeft: 8 }} />}
              </View>
              {studentName !== "" && (
                <Text style={styles.studentNameHint}>👤 {studentName}</Text>
              )}
              <TouchableOpacity
                style={[styles.actionBtn, styles.checkoutBtn, submitting && styles.btnDisabled]}
                onPress={handleCheckout}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Ionicons name="arrow-forward-circle" size={18} color="#fff" /><Text style={styles.actionBtnText}>Check Out</Text></>
                }
              </TouchableOpacity>
            </View>
          )}

          {/* Borrowed → checkin */}
          {result.copy.status !== "available" && result.active_borrowing && (
            <View style={styles.actionSection}>
              <Text style={styles.sectionLabel}>Currently Borrowed By</Text>
              <View style={styles.borrowerCard}>
                <Ionicons name="person-circle-outline" size={22} color={colors.textSecondary} />
                <View style={{ marginLeft: 10 }}>
                  <Text style={styles.borrowerName}>{result.active_borrowing.student_name}</Text>
                  <Text style={styles.borrowerNum}>#{result.active_borrowing.student_number}</Text>
                  <Text style={[styles.borrowerNum, result.active_borrowing.status === "overdue" ? { color: colors.danger } : {}]}>
                    Due: {result.active_borrowing.due_date}
                    {result.active_borrowing.status === "overdue" ? ` (${daysOverdue(result.active_borrowing.due_date)}d overdue)` : ""}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.actionBtn, styles.checkinBtn, submitting && styles.btnDisabled]}
                onPress={handleCheckin}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Ionicons name="return-down-back" size={18} color="#fff" /><Text style={styles.actionBtnText}>Check In / Return</Text></>
                }
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity onPress={reset} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Clear & Scan Again</Text>
          </TouchableOpacity>
        </View>
      )}

      <BarcodeScanner
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanned={handleScanned}
        title="Scan Library Barcode"
      />
    </ScrollView>
  );
}

/* ── Search Tab ───────────────────────────────────────────────── */
function SearchTab() {
  const [query, setQuery] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet(`?action=books&t=${Date.now()}`);
      const data = await res.json();
      setBooks(data.books ?? []);
      setFetched(true);
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBooks();
  };

  const filtered = books.filter((b) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      b.title?.toLowerCase().includes(q) ||
      b.author?.toLowerCase().includes(q) ||
      b.isbn?.includes(q) ||
      b.category?.toLowerCase().includes(q)
    );
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search title, author, ISBN…"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            if (!fetched) fetchBooks();
          }}
          onFocus={() => { if (!fetched) fetchBooks(); }}
          returnKeyType="search"
        />
        {query !== "" && (
          <TouchableOpacity onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {loading && !refreshing ? (
        <View style={commonStyles.centered}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            <View style={commonStyles.centered}>
              <Ionicons name="book-outline" size={48} color={colors.border} />
              <Text style={styles.emptyText}>{fetched ? "No books found" : "Type to search the catalog"}</Text>
            </View>
          }
          renderItem={({ item: b }) => (
            <View style={styles.bookCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bookCardTitle} numberOfLines={2}>{b.title}</Text>
                {b.author ? <Text style={styles.bookCardSub}>{b.author}</Text> : null}
                {b.category ? <Text style={styles.bookCardCategory}>{b.category}</Text> : null}
              </View>
              <View style={styles.availabilityCol}>
                <Text style={[styles.availCount, { color: b.available_copies > 0 ? colors.success : colors.danger }]}>
                  {b.available_copies}/{b.total_copies}
                </Text>
                <Text style={styles.availLabel}>available</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

/* ── Overdue Tab ──────────────────────────────────────────────── */
function OverdueTab() {
  const [items, setItems] = useState<Borrowing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOverdue = useCallback(async () => {
    try {
      const res = await apiGet("?action=borrowings");
      const data = await res.json();
      const all: Borrowing[] = data.borrowings ?? [];
      setItems(all.filter((b) => b.status === "overdue" || (b.status === "borrowed" && new Date(b.due_date) < new Date())));
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOverdue();
  };

  // Auto-fetch on mount
  useState(() => { fetchOverdue(); });

  if (loading) {
    return <View style={commonStyles.centered}><ActivityIndicator color={colors.accent} size="large" /></View>;
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(b) => b.id}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: 80 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      ListHeaderComponent={
        items.length > 0 ? (
          <View style={styles.overdueHeader}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.overdueHeaderText}>{items.length} overdue item{items.length !== 1 ? "s" : ""}</Text>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={commonStyles.centered}>
          <Ionicons name="checkmark-circle-outline" size={56} color={colors.success} />
          <Text style={[styles.emptyText, { color: colors.success }]}>No overdue items!</Text>
        </View>
      }
      renderItem={({ item: b }) => {
        const days = daysOverdue(b.due_date);
        return (
          <View style={[styles.bookCard, { borderLeftWidth: 3, borderLeftColor: colors.danger }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bookCardTitle} numberOfLines={2}>{b.book_title}</Text>
              <View style={styles.overdueStudentRow}>
                <Ionicons name="person-outline" size={12} color={colors.textMuted} />
                <Text style={styles.bookCardSub}> {b.student_name} (#{b.student_number})</Text>
              </View>
              <Text style={styles.bookCardSub}>Due: {b.due_date}</Text>
            </View>
            <View style={styles.daysCol}>
              <Text style={[styles.daysNum, { color: days > 7 ? colors.danger : colors.warning }]}>{days}</Text>
              <Text style={styles.daysLabel}>days</Text>
            </View>
          </View>
        );
      }}
    />
  );
}

/* ── Add Book Tab ─────────────────────────────────────────────── */
interface BookForm {
  title: string;
  author: string;
  isbn: string;
  category: string;
  publisher: string;
  publication_year: string;
  total_copies: string;
}

const EMPTY_FORM: BookForm = { title: "", author: "", isbn: "", category: "", publisher: "", publication_year: "", total_copies: "1" };

function AddBookTab() {
  const [scannerVisible, setScannerVisible] = useState(false);
  const [form, setForm] = useState<BookForm>(EMPTY_FORM);
  const [fetching, setFetching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleISBNScanned = async (isbn: string) => {
    setScannerVisible(false);
    setForm((f) => ({ ...f, isbn }));
    setFetching(true);
    try {
      // Try Google Books first
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=1`);
      if (res.ok) {
        const data = await res.json() as { items?: Array<{ volumeInfo?: { title?: string; authors?: string[]; publisher?: string; publishedDate?: string; categories?: string[] } }> };
        const info = data.items?.[0]?.volumeInfo;
        if (info) {
          setForm((f) => ({
            ...f,
            isbn,
            title: info.title ?? f.title,
            author: (info.authors ?? []).join(", ") || f.author,
            publisher: info.publisher ?? f.publisher,
            publication_year: info.publishedDate?.slice(0, 4) ?? f.publication_year,
            category: info.categories?.[0] ?? f.category,
          }));
        }
      }
    } catch { /* ignore */ }
    setFetching(false);
  };

  const f = (key: keyof BookForm) => ({
    value: form[key],
    onChangeText: (t: string) => setForm((prev) => ({ ...prev, [key]: t })),
  });

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      Alert.alert("Required", "Book title is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiPost({
        action: "add_book",
        title: form.title.trim(),
        author: form.author.trim(),
        isbn: form.isbn.trim(),
        category: form.category.trim(),
        publisher: form.publisher.trim(),
        publication_year: form.publication_year ? parseInt(form.publication_year) : null,
        total_copies: parseInt(form.total_copies) || 1,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        Alert.alert("✓ Book Added", data.message ?? `"${form.title}" added successfully`, [
          { text: "Add Another", onPress: () => setForm(EMPTY_FORM) },
        ]);
      } else {
        Alert.alert("Error", data.error ?? "Failed to add book");
      }
    } catch {
      Alert.alert("Error", "Network error");
    }
    setSubmitting(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.tabContent} keyboardShouldPersistTaps="handled">
        {/* Scan ISBN button */}
        <TouchableOpacity style={styles.scanBtn} onPress={() => setScannerVisible(true)}>
          <Ionicons name="scan-outline" size={28} color={colors.accent} />
          <Text style={styles.scanBtnText}>Scan ISBN Barcode</Text>
          <Text style={styles.scanBtnSub}>Scan the barcode on the back cover to auto-fill details</Text>
        </TouchableOpacity>

        {fetching && (
          <View style={styles.centeredBlock}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.mutedText}>Fetching book info…</Text>
          </View>
        )}

        {/* Form */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Book Details</Text>

          <Text style={styles.fieldLabel}>Title *</Text>
          <TextInput style={styles.input} placeholderTextColor={colors.textMuted} placeholder="Book title" {...f("title")} />

          <Text style={styles.fieldLabel}>Author</Text>
          <TextInput style={styles.input} placeholderTextColor={colors.textMuted} placeholder="Author name" {...f("author")} />

          <Text style={styles.fieldLabel}>ISBN</Text>
          <TextInput style={styles.input} placeholderTextColor={colors.textMuted} placeholder="ISBN number" keyboardType="numeric" {...f("isbn")} />

          <Text style={styles.fieldLabel}>Category / Genre</Text>
          <TextInput style={styles.input} placeholderTextColor={colors.textMuted} placeholder="e.g. Fiction, Science" {...f("category")} />

          <Text style={styles.fieldLabel}>Publisher</Text>
          <TextInput style={styles.input} placeholderTextColor={colors.textMuted} placeholder="Publisher name" {...f("publisher")} />

          <View style={styles.twoCol}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <Text style={styles.fieldLabel}>Publication Year</Text>
              <TextInput style={styles.input} placeholderTextColor={colors.textMuted} placeholder="e.g. 2023" keyboardType="numeric" maxLength={4} {...f("publication_year")} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>No. of Copies</Text>
              <TextInput style={styles.input} placeholderTextColor={colors.textMuted} placeholder="1" keyboardType="numeric" {...f("total_copies")} />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.actionBtn, styles.addBtn, submitting && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <><Ionicons name="add-circle" size={18} color="#fff" /><Text style={styles.actionBtnText}>Add to Library</Text></>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setForm(EMPTY_FORM)} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Clear Form</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <BarcodeScanner
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanned={handleISBNScanned}
        title="Scan ISBN Barcode"
      />
    </KeyboardAvoidingView>
  );
}

/* ── Styles ───────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.text,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    gap: 2,
  },
  tabItemActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
  },
  tabLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: "500",
  },
  tabLabelActive: {
    color: colors.accent,
  },
  tabContent: {
    padding: spacing.md,
    paddingBottom: 100,
    gap: spacing.md,
  },
  scanBtn: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.accent + "60",
    borderStyle: "dashed",
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  scanBtnText: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.text,
  },
  scanBtnSub: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: "center",
  },
  centeredBlock: {
    alignItems: "center",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  errorCard: {
    backgroundColor: colors.danger + "18",
    borderWidth: 1,
    borderColor: colors.danger + "40",
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.sm,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.sm,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: colors.danger,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  retryBtnText: { color: "#fff", fontWeight: "600", fontSize: fontSize.sm },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  resultBookRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  bookIconBox: {
    backgroundColor: colors.accent + "20",
    borderRadius: radius.md,
    padding: spacing.sm + 2,
  },
  resultTitle: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.text,
  },
  resultSub: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusRow: { flexDirection: "row" },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  statusText: { fontSize: fontSize.xs, fontWeight: "700" },
  actionSection: { gap: spacing.sm },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  inputRow: { flexDirection: "row", alignItems: "center" },
  input: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "ios" ? spacing.sm + 2 : spacing.sm,
    fontSize: fontSize.base,
    color: colors.text,
  },
  studentNameHint: {
    fontSize: fontSize.sm,
    color: colors.success,
    marginLeft: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
  },
  checkoutBtn: { backgroundColor: colors.primary },
  checkinBtn: { backgroundColor: colors.success },
  addBtn: { backgroundColor: colors.accent },
  btnDisabled: { opacity: 0.6 },
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: fontSize.base },
  borrowerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  borrowerName: { fontSize: fontSize.base, fontWeight: "600", color: colors.text },
  borrowerNum: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  clearBtn: { alignItems: "center", padding: spacing.sm },
  clearBtnText: { fontSize: fontSize.sm, color: colors.textMuted },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.text,
    paddingVertical: spacing.xs,
  },
  bookCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
  },
  bookCardTitle: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 2,
  },
  bookCardSub: { fontSize: fontSize.xs, color: colors.textSecondary },
  bookCardCategory: {
    fontSize: fontSize.xs,
    color: colors.accent,
    marginTop: 3,
  },
  availabilityCol: { alignItems: "center", marginLeft: spacing.md },
  availCount: { fontSize: fontSize.lg, fontWeight: "700" },
  availLabel: { fontSize: 10, color: colors.textMuted },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
    textAlign: "center",
  },
  overdueHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  overdueHeaderText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.danger,
  },
  overdueStudentRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  daysCol: { alignItems: "center", marginLeft: spacing.md },
  daysNum: { fontSize: fontSize.xl, fontWeight: "800" },
  daysLabel: { fontSize: 10, color: colors.textMuted },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  formTitle: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: "600",
    marginBottom: 3,
    marginTop: spacing.sm,
  },
  twoCol: { flexDirection: "row", marginTop: spacing.xs },
});
