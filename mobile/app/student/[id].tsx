import { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

export default function StudentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [student, setStudent] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      try {
        const snap = await getDoc(doc(db, "students", id));
        if (snap.exists()) {
          setStudent(snap.data());
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!student) {
    return (
      <SafeAreaView style={commonStyles.centered}>
        <Text style={{ color: colors.textMuted }}>Student not found</Text>
      </SafeAreaView>
    );
  }

  const name = (student.FULLNAME || student.fullName_en || "") as string;
  const nameAr = (student.fullName_ar || "") as string;

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Back */}
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.name}>{name}</Text>
          {nameAr ? <Text style={styles.nameAr}>{nameAr}</Text> : null}
          <Text style={styles.meta}>#{id} • {student.CURRENTCLASS as string}</Text>
        </View>

        {/* Info Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal Information</Text>
          <Row label="Student Number" value={id || ""} />
          <Row label="Gender" value={(student.GENDER || "") as string} />
          <Row label="Date of Birth" value={(student.DATEOFBIRTH || "") as string} />
          <Row label="Nationality" value={(student.NATIONALITYNAME || "") as string} />
          <Row label="Religion" value={(student.RELIGION || "") as string} />
          <Row label="Family #" value={(student.FAMILYNUMBER || "") as string} />
        </View>

        {/* Documents */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Documents</Text>
          <Row label="Passport" value={(student.PASSPORTNO || "—") as string} />
          <Row label="Passport Expiry" value={(student.PASSPORTEXPIRYDATE || "—") as string} />
          <Row label="Iqama" value={(student.IQAMANUMBER || "—") as string} />
          <Row label="Iqama Expiry" value={(student.IQAMAEXPIRYDATE || "—") as string} />
        </View>

        {/* Status */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Enrollment</Text>
          <Row label="Status" value={(student.STATUS || "") as string} />
          <Row label="School" value={(student.SCHOOLCODE || "") as string} />
          <Row label="Class" value={(student.CURRENTCLASS || "") as string} />
          <Row label="Section" value={(student.CURRENTSECTION || "") as string} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg },
  backBtn: { paddingBottom: spacing.md },
  backText: { color: colors.primary, fontSize: fontSize.base },
  header: { alignItems: "center", marginBottom: spacing.xl },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  avatarText: { fontSize: fontSize["3xl"], fontWeight: "700", color: colors.white },
  name: { fontSize: fontSize.xl, fontWeight: "700", color: colors.text },
  nameAr: { fontSize: fontSize.base, color: colors.textSecondary },
  meta: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: fontSize.base, fontWeight: "600", color: colors.text, marginBottom: spacing.md },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  rowValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: "500" },
});
