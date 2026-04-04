import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

interface StudentRow {
  id: string;
  name: string;
  nameAr: string;
  class: string;
  number: string;
  status: string;
}

export default function StudentsTab() {
  const router = useRouter();
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    const term = searchText.trim();
    if (!term) return;

    setLoading(true);
    setSearched(true);
    try {
      let q;
      // If search term looks like a student number
      if (/^\d/.test(term)) {
        q = query(
          collection(db, "students"),
          where("STUDENTNUMBER", ">=", term),
          where("STUDENTNUMBER", "<=", term + "\uf8ff"),
          limit(20)
        );
      } else {
        // Search by name (browse_index for prefix search)
        q = query(
          collection(db, "browse_index"),
          where("name_lower", ">=", term.toLowerCase()),
          where("name_lower", "<=", term.toLowerCase() + "\uf8ff"),
          orderBy("name_lower"),
          limit(20)
        );
      }

      const snap = await getDocs(q);
      const rows: StudentRow[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.FULLNAME || data.fullName_en || data.name || "",
          nameAr: data.fullName_ar || "",
          class: data.CURRENTCLASS || data.class || "",
          number: data.STUDENTNUMBER || data.studentNumber || d.id,
          status: data.STATUS || data.status || "",
        };
      });
      setResults(rows);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [searchText]);

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Students</Text>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or number..."
            placeholderTextColor={colors.textMuted}
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
            <Text style={styles.searchBtnText}>🔍</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={commonStyles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            searched ? (
              <Text style={styles.emptyText}>No students found</Text>
            ) : (
              <Text style={styles.emptyText}>
                Search for a student by name or number
              </Text>
            )
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/student/${item.number}`)}
              activeOpacity={0.7}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.studentName}>{item.name}</Text>
                {item.nameAr ? (
                  <Text style={styles.studentNameAr}>{item.nameAr}</Text>
                ) : null}
                <Text style={styles.studentMeta}>
                  {item.number} • {item.class}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  item.status === "مسحوب" && styles.statusWithdrawn,
                ]}
              >
                <Text style={styles.statusText}>
                  {item.status === "مسحوب" ? "W" : "A"}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.text,
  },
  searchRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.base,
    color: colors.text,
  },
  searchBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
  searchBtnText: {
    fontSize: 20,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primaryDark,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.white,
  },
  cardContent: {
    flex: 1,
  },
  studentName: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
  },
  studentNameAr: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  studentMeta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.success + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  statusWithdrawn: {
    backgroundColor: colors.danger + "20",
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: colors.success,
  },
  emptyText: {
    textAlign: "center",
    color: colors.textMuted,
    marginTop: spacing.xxl,
    fontSize: fontSize.base,
  },
});

