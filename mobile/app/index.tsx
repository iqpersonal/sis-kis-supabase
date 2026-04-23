import { Redirect } from "expo-router";
import { useAuth, isStoreRole, isStaffOnlyRole } from "@/context/auth-context";
import { useParent } from "@/context/parent-context";
import { View, ActivityIndicator } from "react-native";
import { colors } from "@/lib/theme";

export default function Index() {
  const { user, roles, loading: authLoading } = useAuth();
  const { familyNumber, loading: parentLoading } = useParent();

  if (authLoading || parentLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // If admin/teacher is signed in via Firebase Auth
  if (user) {
    // Staff-only users get the staff portal
    if (isStaffOnlyRole(roles)) {
      return <Redirect href="/(staff)/home" />;
    }
    // Store-only roles get the focused store experience
    if (isStoreRole(roles)) {
      return <Redirect href="/(store)" />;
    }
    // Everyone else (teacher, admin, librarian, multi-role) gets the main tabs
    return <Redirect href="/(tabs)" />;
  }

  // If parent is signed in via family credentials
  if (familyNumber) {
    return <Redirect href="/(parent)" />;
  }

  // Not signed in — show role selector
  return <Redirect href="/login" />;
}

