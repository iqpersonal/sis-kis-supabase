import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useParent } from "@/context/parent-context";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

export default function ParentProfile() {
  const router = useRouter();
  const { selectedChild, familyNumber, children, signOut } = useParent();

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => {
          signOut();
          router.replace("/login");
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Profile</Text>

        {/* Family Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Family Information</Text>
          <Row label="Family Number" value={familyNumber || "—"} />
          <Row label="Children" value={String(children.length)} />
        </View>

        {/* Selected Child */}
        {selectedChild && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Selected Child</Text>
            <Row label="Name" value={selectedChild.fullName} />
            {selectedChild.fullNameAr ? (
              <Row label="Arabic Name" value={selectedChild.fullNameAr} />
            ) : null}
            <Row label="Student #" value={selectedChild.studentNumber} />
            <Row label="Class" value={selectedChild.class} />
            <Row label="Section" value={selectedChild.section} />
            <Row label="School" value={selectedChild.school} />
          </View>
        )}

        {/* App Info */}
        <View style={styles.card}>
          <Row label="App Version" value="1.0.0" />
        </View>

        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
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
  content: { flex: 1, padding: spacing.lg },
  title: { fontSize: fontSize["2xl"], fontWeight: "700", color: colors.text, marginBottom: spacing.xl },
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
  rowValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: "500", maxWidth: "60%" as unknown as number, textAlign: "right" },
  signOutBtn: {
    backgroundColor: colors.danger + "15",
    borderWidth: 1,
    borderColor: colors.danger + "40",
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  signOutText: { fontSize: fontSize.base, fontWeight: "600", color: colors.danger },
});

