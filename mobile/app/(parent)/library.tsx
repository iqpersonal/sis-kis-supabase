import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParent } from "@/context/parent-context";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";
import ChildSelector from "@/components/ChildSelector";

/* ─── Types ─── */
interface Borrowing {
  id: string;
  book_title: string;
  book_title_ar: string;
  author: string;
  borrow_date: string;
  due_date: string;
  return_date: string | null;
  status: "borrowed" | "returned" | "overdue";
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

const statusConfig = {
  borrowed: { emoji: "📖", label: "Borrowed", color: colors.primary },
  overdue: { emoji: "⚠️", label: "Overdue", color: colors.danger },
  returned: { emoji: "✅", label: "Returned", color: colors.success },
};

export default function LibraryScreen() {
  const { children, selectedChild } = useParent();
  const [borrowings, setBorrowings] = useState<Borrowing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const child = selectedChild || children[0];

  const fetchBorrowings = useCallback(async () => {
    if (!child) return;

    try {
      const q = query(
        collection(db, "library_borrowings"),
        where("student_number", "==", child.studentNumber),
        orderBy("borrow_date", "desc")
      );
      const snap = await getDocs(q);

      const now = new Date();
      const results: Borrowing[] = snap.docs.map((d) => {
        const data = d.data();
        let status = data.status as Borrowing["status"];
        // Mark overdue on client side
        if (status === "borrowed" && data.due_date) {
          const due = new Date(data.due_date);
          if (due < now) status = "overdue";
        }
        return {
          id: d.id,
          book_title: data.book_title || "",
          book_title_ar: data.book_title_ar || "",
          author: data.author || "",
          borrow_date: data.borrow_date || "",
          due_date: data.due_date || "",
          return_date: data.return_date || null,
          status,
        };
      });

      setBorrowings(results);
    } catch {
      setBorrowings([]);
    }
  }, [child]);

  useEffect(() => {
    setLoading(true);
    fetchBorrowings().finally(() => setLoading(false));
  }, [fetchBorrowings]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchBorrowings();
    setRefreshing(false);
  };

  const active = borrowings.filter(
    (b) => b.status === "borrowed" || b.status === "overdue"
  );
  const returned = borrowings.filter((b) => b.status === "returned");
  const overdueCount = borrowings.filter((b) => b.status === "overdue").length;

  if (!child) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={styles.scroll}>
          <Text style={styles.title}>Library</Text>
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>📚</Text>
            <Text style={styles.emptyText}>Select a child first</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={styles.title}>Library</Text>
        <Text style={styles.subtitle}>
          {child.fullName} • #{child.studentNumber}
        </Text>

        <ChildSelector />

        {loading ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={{ marginTop: 60 }}
          />
        ) : (
          <>
            {/* Summary cards */}
            <View style={styles.summaryRow}>
              <View
                style={[
                  styles.summaryCard,
                  { borderBottomColor: colors.primary },
                ]}
              >
                <Text style={{ fontSize: 24 }}>📖</Text>
                <Text style={styles.summaryValue}>{active.length}</Text>
                <Text style={styles.summaryLabel}>Borrowed</Text>
              </View>
              <View
                style={[
                  styles.summaryCard,
                  { borderBottomColor: colors.danger },
                ]}
              >
                <Text style={{ fontSize: 24 }}>⚠️</Text>
                <Text
                  style={[
                    styles.summaryValue,
                    overdueCount > 0 && { color: colors.danger },
                  ]}
                >
                  {overdueCount}
                </Text>
                <Text style={styles.summaryLabel}>Overdue</Text>
              </View>
              <View
                style={[
                  styles.summaryCard,
                  { borderBottomColor: colors.success },
                ]}
              >
                <Text style={{ fontSize: 24 }}>✅</Text>
                <Text style={styles.summaryValue}>{returned.length}</Text>
                <Text style={styles.summaryLabel}>Returned</Text>
              </View>
            </View>

            {/* Currently borrowed */}
            {active.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Currently Borrowed</Text>
                {active.map((b) => {
                  const cfg = statusConfig[b.status];
                  const dueDate = new Date(b.due_date);
                  const daysLeft = daysBetween(new Date(), dueDate);
                  return (
                    <View
                      key={b.id}
                      style={[
                        styles.card,
                        { borderLeftColor: cfg.color },
                      ]}
                    >
                      <View style={styles.cardHeader}>
                        <Text style={{ fontSize: 20 }}>{cfg.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.bookTitle}>{b.book_title}</Text>
                          {b.book_title_ar &&
                            b.book_title_ar !== b.book_title && (
                              <Text style={styles.bookTitleAr}>
                                {b.book_title_ar}
                              </Text>
                            )}
                          {b.author ? (
                            <Text style={styles.author}>by {b.author}</Text>
                          ) : null}
                        </View>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: cfg.color + "20" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              { color: cfg.color },
                            ]}
                          >
                            {cfg.label}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Borrowed</Text>
                        <Text style={styles.detailValue}>
                          {new Date(b.borrow_date).toLocaleDateString()}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Due Date</Text>
                        <Text
                          style={[
                            styles.detailValue,
                            b.status === "overdue" && {
                              color: colors.danger,
                              fontWeight: "700",
                            },
                          ]}
                        >
                          {dueDate.toLocaleDateString()}
                        </Text>
                      </View>
                      <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                        <Text style={styles.detailLabel}>
                          {daysLeft < 0 ? "Overdue by" : "Days remaining"}
                        </Text>
                        <Text
                          style={[
                            styles.detailValue,
                            {
                              fontWeight: "700",
                              color:
                                daysLeft < 0
                                  ? colors.danger
                                  : daysLeft <= 3
                                    ? colors.warning
                                    : colors.success,
                            },
                          ]}
                        >
                          {daysLeft < 0
                            ? `${Math.abs(daysLeft)} days`
                            : `${daysLeft} days`}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={{ fontSize: 48 }}>📚</Text>
                <Text style={styles.emptyText}>
                  No books currently borrowed
                </Text>
                <Text style={styles.emptySubtext}>
                  Books checked out from the school library will appear here
                </Text>
              </View>
            )}

            {/* History */}
            {returned.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Borrowing History</Text>
                {returned.slice(0, 20).map((b) => (
                  <View key={b.id} style={styles.historyCard}>
                    <View style={styles.historyRow}>
                      <Text style={{ fontSize: 16 }}>✅</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyTitle}>{b.book_title}</Text>
                        {b.author ? (
                          <Text style={styles.historyAuthor}>
                            by {b.author}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.historyDate}>
                        {b.return_date
                          ? new Date(b.return_date).toLocaleDateString()
                          : "Returned"}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}

            {/* Empty state when truly no records */}
            {borrowings.length === 0 && (
              <View style={styles.emptyCard}>
                <Text style={{ fontSize: 48 }}>📚</Text>
                <Text style={styles.emptyText}>No library records</Text>
                <Text style={styles.emptySubtext}>
                  Your child&apos;s library borrowing history will appear here
                  once they start borrowing books from the school library.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    gap: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 3,
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.xs,
  },
  summaryValue: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.text,
  },
  summaryLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  bookTitle: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
  },
  bookTitleAr: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  author: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  detailValue: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: "500",
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  historyTitle: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: colors.text,
  },
  historyAuthor: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  historyDate: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
});
