import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
} from "react-native";
import { useRouter, useNavigationContainerRef } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useParent } from "@/context/parent-context";
import { colors, spacing, fontSize, commonStyles } from "@/lib/theme";
import { CommonActions } from "@react-navigation/native";

export default function ParentLogin() {
  const router = useRouter();
  const navRef = useNavigationContainerRef();
  const { signIn } = useParent();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert("Error", "Please enter both username and password");
      return;
    }

    setLoading(true);
    try {
      const success = await signIn(username.trim(), password.trim());
      if (success) {
        // Reset navigation stack so back button won't return to login
        if (navRef.isReady()) {
          navRef.dispatch(
            CommonActions.reset({ index: 0, routes: [{ name: "index" }] })
          );
        } else {
          router.replace("/(parent)");
        }
      } else {
        Alert.alert("Login Failed", "Invalid username or password");
      }
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.content}
      >
        {/* Back button */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.accentLight} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.form}>
          <Image
            source={require("../../assets/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={commonStyles.title}>Parent Login</Text>
          <Text style={commonStyles.subtitle}>
            Sign in to view your child&apos;s progress
          </Text>

          <View style={styles.inputs}>
            <TextInput
              style={commonStyles.input}
              placeholder="Family username"
              placeholderTextColor={colors.textMuted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Family username"
            />
            <TextInput
              style={commonStyles.input}
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              accessibilityLabel="Password"
            />
          </View>

          <TouchableOpacity
            style={[commonStyles.buttonPrimary, loading && styles.disabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Sign In"
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={commonStyles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  backText: {
    color: colors.accentLight,
    fontSize: fontSize.base,
  },
  form: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: spacing.sm,
  },
  inputs: {
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    width: "100%",
  },
  disabled: {
    opacity: 0.6,
  },
});

