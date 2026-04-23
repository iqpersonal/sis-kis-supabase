import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { auth } from "@/lib/firebase";
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

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

interface Student {
  studentNumber: string;
  nameEn: string;
  nameAr: string;
  gender?: string;
  grade?: string;
  section?: string;
}

interface AttendanceRecord {
  studentNumber: string;
  status: "present" | "absent" | "late";
}

type SubTab = "students" | "attendance";

function SubTabBar({ active, onSwitch }: { active: SubTab; onSwitch: (t: SubTab) => void }) {
  return (
    <View style={segStyles.container}>
      {(["students", "attendance"] as SubTab[]).map((t) => (
        <TouchableOpacity key={t} style={[segStyles.tab, active === t && segStyles.tabActive]} onPress={() => onSwitch(t)}>
          <Text style={[segStyles.label, active === t && segStyles.labelActive]}>
            {t === "students" ? "👥 Students" : "📅 Attendance"}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const segStyles = StyleSheet.create({
  container: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.md, padding: 3, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm, borderRadius: radius.md - 2 },
  tabActive: { backgroundColor: colors.primary },
  label: { fontSize: fontSize.sm, fontWeight: "600", color: colors.textMuted },
  labelActive: { color: colors.white },
});

export default function ClassDetailScreen() {
  const router = useRouter();
  const { id, className, section, subject, year } = useLocalSearchParams<{
    id: string; className: string; section: string; subject: string; year: string;
  }>();

  const [activeTab, setActiveTab] = useState<SubTab>("students");
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);

  // Attendance state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [attendance, setAttendance] = useState<Record<string, "present" | "absent" | "late">>({});
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStudents = useCallback(async () => {
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (id) params.set("classId", id);
      if (year) params.set("year", year);
      const res = await fetch(`${API_BASE}/teacher/students?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStudents(data.students || []);
      // Default all to present
      const init: Record<string, "present" | "absent" | "late"> = {};
      (data.students || []).forEach((s: Student) => { init[s.studentNumber] = "present"; });
      setAttendance((prev) => ({ ...init, ...prev }));
    } catch (err) {
      console.error("Failed to fetch students:", err);
    }
  }, [id, year]);

  const fetchAttendance = useCallback(async (date: Date) => {
    if (!className) return;
    setAttendanceLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ class: className, date: toISO(date) });
      if (section) params.set("section", section);
      const res = await fetch(`${API_BASE}/teacher/attendance?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const records: AttendanceRecord[] = data.records || [];
      if (records.length > 0) {
        const map: Record<string, "present" | "absent" | "late"> = {};
        records.forEach((r) => { map[r.studentNumber] = r.status as "present" | "absent" | "late"; });
        setAttendance((prev) => ({ ...prev, ...map }));
      }
    } catch (err) {
      console.error("Failed to fetch attendance:", err);
    } finally {
      setAttendanceLoading(false);
    }
  }, [className, section]);

  useEffect(() => {
    setStudentsLoading(true);
    fetchStudents().finally(() => setStudentsLoading(false));
  }, [fetchStudents]);

  useEffect(() => {
    if (activeTab === "attendance") {
      fetchAttendance(selectedDate);
    }
  }, [activeTab, selectedDate, fetchAttendance]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchStudents();
    if (activeTab === "attendance") await fetchAttendance(selectedDate);
    setRefreshing(false);
  }, [fetchStudents, fetchAttendance, activeTab, selectedDate]);

  const cycleStatus = (sn: string) => {
    setAttendance((prev) => {
      const cur = prev[sn] || "present";
      const next: Record<string, "present" | "absent" | "late"> = {
        present: "absent", absent: "late", late: "present",
      };
      return { ...prev, [sn]: next[cur] };
    });
  };

  const saveAttendance = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const token = await getToken();
      const records = students.map((s) => ({
        studentNumber: s.studentNumber,
        status: attendance[s.studentNumber] || "present",
      }));
      const res = await fetch(`${API_BASE}/teacher/attendance`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ class: className, section, date: toISO(selectedDate), records }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save attendance:", err);
    } finally {
      setSaving(false);
    }
  };

  const statusColor = (status: string) => {
    if (status === "absent") return colors.danger;
    if (status === "late") return colors.warning;
    return colors.success || "#22c55e";
  };

  const statusIcon = (status: string) => {
    if (status === "absent") return "✗";
    if (status === "late") return "◑";
    return "✓";
  };

  const presentCount = students.filter((s) => (attendance[s.studentNumber] || "present") === "present").length;
  const absentCount = students.filter((s) => attendance[s.studentNumber] === "absent").length;
  const lateCount = students.filter((s) => attendance[s.studentNumber] === "late").length;

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Header */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{className || "Class"}</Text>
        <View style={styles.meta}>
          <View style={styles.metaTag}><Text style={styles.metaTagText}>Section {section}</Text></View>
          {subject ? <View style={styles.metaTag}><Text style={styles.metaTagText}>{subject}</Text></View> : null}
          {year ? <View style={styles.metaTag}><Text style={styles.metaTagText}>{year}</Text></View> : null}
        </View>

        <SubTabBar active={activeTab} onSwitch={setActiveTab} />

        {/* ── STUDENTS TAB ── */}
        {activeTab === "students" && (
          <>
            {studentsLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
            ) : students.length === 0 ? (
              <View style={styles.empty}>
                <Text style={{ fontSize: 48 }}>👥</Text>
                <Text style={styles.emptyText}>No students found for this class.</Text>
              </View>
            ) : (
              <>
                <Text style={styles.countLabel}>{students.length} student{students.length !== 1 ? "s" : ""}</Text>
                {students.map((s, i) => (
                  <View key={s.studentNumber} style={styles.studentRow}>
                    <View style={styles.studentIndex}>
                      <Text style={styles.studentIndexText}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.studentName}>{s.nameEn}</Text>
                      <Text style={styles.studentMeta}>{s.studentNumber}{s.gender ? ` · ${s.gender}` : ""}</Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* ── ATTENDANCE TAB ── */}
        {activeTab === "attendance" && (
          <>
            {/* Date picker */}
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPicker(true)}>
              <Text style={styles.dateBtnLabel}>📅 Date</Text>
              <Text style={styles.dateBtnValue}>{selectedDate.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}</Text>
            </TouchableOpacity>
            {showPicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, d) => { setShowPicker(false); if (d) setSelectedDate(d); }}
                maximumDate={new Date()}
              />
            )}

            {/* Summary bar */}
            {students.length > 0 && (
              <View style={styles.summaryBar}>
                <View style={[styles.summaryItem, { borderColor: "#22c55e" }]}>
                  <Text style={[styles.summaryCount, { color: "#22c55e" }]}>{presentCount}</Text>
                  <Text style={styles.summaryLabel}>Present</Text>
                </View>
                <View style={[styles.summaryItem, { borderColor: colors.danger }]}>
                  <Text style={[styles.summaryCount, { color: colors.danger }]}>{absentCount}</Text>
                  <Text style={styles.summaryLabel}>Absent</Text>
                </View>
                <View style={[styles.summaryItem, { borderColor: colors.warning }]}>
                  <Text style={[styles.summaryCount, { color: colors.warning }]}>{lateCount}</Text>
                  <Text style={styles.summaryLabel}>Late</Text>
                </View>
              </View>
            )}

            {attendanceLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
            ) : studentsLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
            ) : students.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No students to mark attendance for.</Text>
              </View>
            ) : (
              <>
                <Text style={styles.attendanceHint}>Tap a student to cycle: Present → Absent → Late</Text>
                {students.map((s) => {
                  const status = attendance[s.studentNumber] || "present";
                  return (
                    <TouchableOpacity
                      key={s.studentNumber}
                      style={[styles.attendanceRow, { borderLeftColor: statusColor(status) }]}
                      onPress={() => cycleStatus(s.studentNumber)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.statusCircle, { backgroundColor: statusColor(status) }]}>
                        <Text style={styles.statusIcon}>{statusIcon(status)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.studentName}>{s.nameEn}</Text>
                        <Text style={styles.studentMeta}>{s.studentNumber}</Text>
                      </View>
                      <Text style={[styles.statusLabel, { color: statusColor(status) }]}>{status.charAt(0).toUpperCase() + status.slice(1)}</Text>
                    </TouchableOpacity>
                  );
                })}

                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                  onPress={saveAttendance}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.saveBtnText}>{saveSuccess ? "✓ Saved!" : "Save Attendance"}</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 100 },
  backBtn: { marginBottom: spacing.sm },
  backText: { fontSize: fontSize.base, color: colors.primary, fontWeight: "500" },
  title: { fontSize: fontSize["2xl"], fontWeight: "700", color: colors.text, marginBottom: spacing.xs },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.lg },
  metaTag: { backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  metaTagText: { fontSize: fontSize.sm, color: colors.textSecondary },
  countLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: spacing.md },
  emptyText: { fontSize: fontSize.base, color: colors.textSecondary, textAlign: "center" },
  studentRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.xs, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  studentIndex: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary + "22", alignItems: "center", justifyContent: "center" },
  studentIndexText: { fontSize: fontSize.xs, fontWeight: "700", color: colors.primary },
  studentName: { fontSize: fontSize.base, fontWeight: "500", color: colors.text },
  studentMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  dateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  dateBtnLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  dateBtnValue: { fontSize: fontSize.base, fontWeight: "600", color: colors.text },
  summaryBar: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  summaryItem: { flex: 1, alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 2, padding: spacing.sm },
  summaryCount: { fontSize: fontSize.xl, fontWeight: "700" },
  summaryLabel: { fontSize: fontSize.xs, color: colors.textMuted },
  attendanceHint: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: "center", marginBottom: spacing.md },
  attendanceRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderLeftWidth: 4, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.xs, gap: spacing.md },
  statusCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  statusIcon: { color: colors.white, fontWeight: "700", fontSize: 16 },
  statusLabel: { fontSize: fontSize.sm, fontWeight: "600" },
  saveBtn: { marginTop: spacing.lg, backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: "center" },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: colors.white, fontWeight: "700", fontSize: fontSize.base },
});
