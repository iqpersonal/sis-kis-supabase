import { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

const API_BASE = "https://sis-kis.web.app/api";

let _cachedToken: string | undefined;
let _tokenExpiry = 0;
async function getToken(): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;
  const t = await auth.currentUser?.getIdToken();
  _cachedToken = t ?? "";
  _tokenExpiry = Date.now() + 50 * 60 * 1000;
  return _cachedToken;
}

export default function StudentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [student, setStudent] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  // Grades from student_progress
  interface SubjectGrade { subject: string; grade: number; }
  interface GradesData { year: string; overall_avg: number; subjects: SubjectGrade[]; }
  const [grades, setGrades] = useState<GradesData | null>(null);

  // Attendance summary
  interface AbsenceRecord { date: string; days: number; status: string; }
  const [absences, setAbsences] = useState<AbsenceRecord[]>([]);
  const [gradesLoading, setGradesLoading] = useState(true);
  const [attendanceLoading, setAttendanceLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchAll = async () => {
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

      // Fetch grades from student_progress
      try {
        const progressSnap = await getDoc(doc(db, "student_progress", id));
        if (progressSnap.exists()) {
          const d = progressSnap.data();
          const years = Object.keys(d.years || {}).sort();
          const latestYear = years[years.length - 1];
          if (latestYear) {
            const yd = d.years[latestYear];
            setGrades({
              year: latestYear,
              overall_avg: yd.overall_avg ?? null,
              subjects: (yd.subjects || []).map((s: Record<string, unknown>) => ({
                subject: s.subject as string,
                grade: s.grade as number,
              })),
            });
          }
        }
      } catch {
        // ignore
      } finally {
        setGradesLoading(false);
      }

      // Fetch attendance summary
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/attendance?studentNumber=${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const records = data.absences || data.records || [];
          setAbsences(
            records.slice(0, 10).map((r: Record<string, unknown>) => ({
              date: r.date || r.Absence_Date || "",
              days: Number(r.days || r.No_of_Days || 1),
              status: r.status || "absent",
            }))
          );
        }
      } catch {
        // ignore
      } finally {
        setAttendanceLoading(false);
      }
    };
    fetchAll();
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

        {/* Grades */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📊 Academic Performance</Text>
          {gradesLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : !grades ? (
            <Text style={styles.emptyNote}>No grade data available.</Text>
          ) : (
            <>
              <View style={styles.gradeHeader}>
                <Text style={styles.gradeYear}>Year 20{grades.year}</Text>
                {grades.overall_avg != null && (
                  <View style={[styles.avgBadge, { backgroundColor: grades.overall_avg >= 60 ? colors.success || "#22c55e" : colors.danger }]}>
                    <Text style={styles.avgText}>{grades.overall_avg.toFixed(1)}%</Text>
                  </View>
                )}
              </View>
              {grades.subjects.map((s) => (
                <View key={s.subject} style={styles.row}>
                  <Text style={styles.rowLabel}>{s.subject}</Text>
                  <Text style={[styles.rowValue, { color: s.grade < 60 ? colors.danger : colors.text }]}>
                    {s.grade != null ? `${s.grade}%` : "—"}
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>

        {/* Attendance */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📅 Absence History</Text>
          {attendanceLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : absences.length === 0 ? (
            <Text style={styles.emptyNote}>No recorded absences.</Text>
          ) : (
            absences.map((a, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.rowLabel}>{a.date}</Text>
                <Text style={[styles.rowValue, { color: colors.danger }]}>
                  {a.days} day{a.days !== 1 ? "s" : ""}
                </Text>
              </View>
            ))
          )}
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
  emptyNote: { fontSize: fontSize.sm, color: colors.textMuted, fontStyle: "italic" },
  gradeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  gradeYear: { fontSize: fontSize.sm, fontWeight: "600", color: colors.textSecondary },
  avgBadge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  avgText: { fontSize: fontSize.sm, fontWeight: "700", color: colors.white },
});
