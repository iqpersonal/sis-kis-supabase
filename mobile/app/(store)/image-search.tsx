import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator,
  FlatList, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import Ionicons from "@expo/vector-icons/Ionicons";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth, getStoreAccess } from "@/context/auth-context";
import { GENERAL_STORE_CONFIG, IT_STORE_CONFIG, type StoreConfig } from "@/lib/store-config";
import type { StoreItem } from "@/types/store";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

const GEMINI_API_KEY = "AIzaSyCylvB4JTxZhaUSK4vAUwwlrCHOYAmB2gQ";

interface MatchResult {
  item: StoreItem;
  storeConfig: StoreConfig;
  score: number;
  reason: string;
}

/**
 * Send image to Gemini Vision and get product identification keywords.
 */
async function identifyProductFromImage(base64: string): Promise<{
  keywords: string[];
  description: string;
}> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64,
              },
            },
            {
              text: `Identify this product/item in the image. Return ONLY a JSON object (no markdown fences) with:
- "description": a brief 1-line description of what you see
- "keywords": an array of 5-10 lowercase English search keywords that describe this item (e.g. ["pen", "blue", "ballpoint", "stationery", "writing"])

Include the product name, type, color, brand (if visible), and category as keywords.
If you cannot identify the item, return: {"description":"Unknown item","keywords":[]}`,
            },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 300,
        },
      }),
    }
  );

  if (!res.ok) throw new Error("Gemini API error");
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No response from Gemini");

  const jsonStr = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(jsonStr);
  return {
    keywords: parsed.keywords || [],
    description: parsed.description || "Unknown item",
  };
}

/**
 * Search inventory items by matching keywords against item names.
 */
function matchItemsByKeywords(
  items: StoreItem[],
  keywords: string[],
  config: StoreConfig,
): MatchResult[] {
  if (!keywords.length) return [];

  const results: MatchResult[] = [];
  const lowerKeywords = keywords.map((k) => k.toLowerCase());

  for (const item of items) {
    const nameLower = item.name.toLowerCase();
    const nameArLower = (item.name_ar || "").toLowerCase();
    const catLabel = (config.categoryLabels[item.category] || item.category || "").toLowerCase();
    const combined = `${nameLower} ${nameArLower} ${catLabel} ${(item.notes || "").toLowerCase()}`;

    let score = 0;
    const matched: string[] = [];
    for (const kw of lowerKeywords) {
      if (combined.includes(kw)) {
        score += 1;
        matched.push(kw);
      }
    }

    // Also check if item name appears as substring of any keyword or vice versa
    const nameWords = nameLower.split(/\s+/);
    for (const word of nameWords) {
      if (word.length < 3) continue;
      for (const kw of lowerKeywords) {
        if (kw.includes(word) || word.includes(kw)) {
          if (!matched.includes(kw)) {
            score += 0.5;
            matched.push(kw);
          }
        }
      }
    }

    if (score > 0) {
      results.push({
        item,
        storeConfig: config,
        score,
        reason: `Matched: ${matched.join(", ")}`,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 10);
}

export default function ImageSearchScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [searched, setSearched] = useState(false);

  const { roles } = useAuth();
  const access = getStoreAccess(roles);
  const router = useRouter();

  const searchWithImage = useCallback(async (uri: string) => {
    setLoading(true);
    setResults([]);
    setSearched(false);
    setDescription("");
    setKeywords([]);

    try {
      // 1. Read image as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: "base64",
      });

      // 2. Send to Gemini Vision for identification
      const identification = await identifyProductFromImage(base64);
      setDescription(identification.description);
      setKeywords(identification.keywords);

      if (!identification.keywords.length) {
        setSearched(true);
        setLoading(false);
        return;
      }

      // 3. Fetch inventory from stores the user has access to
      const allMatches: MatchResult[] = [];
      const configs: StoreConfig[] = [];
      if (access.general) configs.push(GENERAL_STORE_CONFIG);
      if (access.it) configs.push(IT_STORE_CONFIG);

      for (const cfg of configs) {
        const q = query(collection(db, cfg.collections.items), orderBy("name"));
        const snap = await getDocs(q);
        const items: StoreItem[] = [];
        snap.forEach((d) => items.push({ id: d.id, ...d.data() } as StoreItem));

        const matches = matchItemsByKeywords(items, identification.keywords, cfg);
        allMatches.push(...matches);
      }

      // Sort all matches by score
      allMatches.sort((a, b) => b.score - a.score);
      setResults(allMatches.slice(0, 10));
      setSearched(true);
    } catch (e: any) {
      Alert.alert("Search Failed", e.message || "Could not identify the image");
    } finally {
      setLoading(false);
    }
  }, [access]);

  const pickFromCamera = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]) {
        const uri = result.assets[0].uri;
        setImageUri(uri);
        searchWithImage(uri);
      }
    } catch {
      Alert.alert("Error", "Could not open camera");
    }
  };

  const pickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]) {
        const uri = result.assets[0].uri;
        setImageUri(uri);
        searchWithImage(uri);
      }
    } catch {
      Alert.alert("Error", "Could not open gallery");
    }
  };

  const handleItemPress = (match: MatchResult) => {
    router.push({
      pathname: "/(store)/item/[id]",
      params: { id: match.item.id, store: match.storeConfig.type },
    });
  };

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Search by Image</Text>
      </View>

      <View style={styles.content}>
        {/* Pick buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.pickBtn} onPress={pickFromCamera} activeOpacity={0.7}>
            <Ionicons name="camera-outline" size={28} color="#fff" />
            <Text style={styles.pickBtnText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pickBtn, styles.galleryBtn]} onPress={pickFromGallery} activeOpacity={0.7}>
            <Ionicons name="images-outline" size={28} color="#fff" />
            <Text style={styles.pickBtnText}>Gallery</Text>
          </TouchableOpacity>
        </View>

        {/* Selected image preview */}
        {imageUri && (
          <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
        )}

        {/* Loading */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Identifying product...</Text>
          </View>
        )}

        {/* AI description */}
        {description && !loading && (
          <View style={styles.descBox}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
            <Text style={styles.descText}>{description}</Text>
          </View>
        )}

        {/* Keywords */}
        {keywords.length > 0 && !loading && (
          <View style={styles.keywordRow}>
            {keywords.map((kw) => (
              <View key={kw} style={styles.keyword}>
                <Text style={styles.keywordText}>{kw}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Results */}
        {searched && !loading && (
          <View style={styles.resultsSection}>
            <Text style={styles.resultsTitle}>
              {results.length > 0
                ? `Found ${results.length} matching item${results.length > 1 ? "s" : ""}`
                : "No matching items in inventory"}
            </Text>
            <FlatList
              data={results}
              keyExtractor={(m) => `${m.storeConfig.type}-${m.item.id}`}
              renderItem={({ item: match }) => {
                const imgSrc = match.item.image_url || match.item.custom_image_url;
                return (
                  <TouchableOpacity style={styles.resultRow} onPress={() => handleItemPress(match)} activeOpacity={0.7}>
                    {imgSrc ? (
                      <Image source={{ uri: imgSrc }} style={styles.thumb} />
                    ) : (
                      <View style={styles.thumbPlaceholder}>
                        <Ionicons name="cube-outline" size={24} color={colors.textMuted} />
                      </View>
                    )}
                    <View style={styles.resultInfo}>
                      <Text style={styles.resultName} numberOfLines={1}>{match.item.name}</Text>
                      <Text style={styles.resultMeta}>
                        {match.storeConfig.label} • Qty: {match.item.quantity} • {match.reason}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  Try taking a clearer photo of the product label or packaging.
                </Text>
              }
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { marginRight: spacing.sm },
  title: { fontSize: fontSize.xl, fontWeight: "700", color: colors.text },
  content: { flex: 1, padding: spacing.md },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  pickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  galleryBtn: { backgroundColor: colors.primaryLight },
  pickBtnText: { color: "#fff", fontWeight: "600", fontSize: fontSize.base },
  preview: {
    width: "100%",
    height: 180,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: spacing.lg,
  },
  loadingText: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  descBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.primary + "10",
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  descText: { color: colors.text, fontSize: fontSize.sm, flex: 1 },
  keywordRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: spacing.md,
  },
  keyword: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  keywordText: { fontSize: fontSize.xs, color: colors.textSecondary },
  resultsSection: { flex: 1 },
  resultsTitle: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    marginRight: spacing.sm,
  },
  thumbPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.border + "40",
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  resultInfo: { flex: 1 },
  resultName: { fontSize: fontSize.base, fontWeight: "600", color: colors.text },
  resultMeta: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  emptyText: {
    textAlign: "center",
    color: colors.textMuted,
    paddingVertical: spacing.lg,
    fontSize: fontSize.sm,
  },
});
