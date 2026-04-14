import { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth, getStoreAccess } from "@/context/auth-context";
import { useStoreRequests } from "@/hooks/use-store-data";
import { GENERAL_STORE_CONFIG, IT_STORE_CONFIG, type StoreConfig } from "@/lib/store-config";
import { approveRequest, rejectRequest, issueRequest } from "@/lib/store-actions";
import type { StoreRequest, RequestStatus } from "@/types/store";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";

const STATUS_TABS: { label: string; value: string | undefined }[] = [
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Issued", value: "issued" },
  { label: "All", value: undefined },
];

const STATUS_COLORS: Record<string, string> = {
  pending: colors.warning,
  approved: colors.primary,
  partially_approved: colors.primaryLight,
  rejected: colors.danger,
  issued: colors.success,
};

function StatusBadge({ status }: { status: RequestStatus }) {
  const color = STATUS_COLORS[status] || colors.textMuted;
  return (
    <View style={[styles.statusBadge, { backgroundColor: color + "20" }]}>
      <Text style={[styles.statusText, { color }]}>{status.replace("_", " ")}</Text>
    </View>
  );
}

export default function RequestsScreen() {
  const { role, user } = useAuth();
  const access = getStoreAccess(role);
  const router = useRouter();

  const [activeStore, setActiveStore] = useState<StoreConfig>(
    access.general ? GENERAL_STORE_CONFIG : IT_STORE_CONFIG
  );
  const [statusFilter, setStatusFilter] = useState<string | undefined>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const { requests, loading } = useStoreRequests(activeStore, statusFilter);

  const handleApprove = async (req: StoreRequest) => {
    Alert.alert("Approve Request", `Approve request ${req.request_id}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Approve",
        onPress: async () => {
          setActionLoading(true);
          try {
            await approveRequest(activeStore, req, user?.uid || "", user?.displayName || "");
          } catch (e: unknown) {
            Alert.alert("Error", e instanceof Error ? e.message : "Failed");
          }
          setActionLoading(false);
        },
      },
    ]);
  };

  const handleReject = async (req: StoreRequest) => {
    if (typeof Alert.prompt === "function") {
      Alert.prompt(
        "Reject Request",
        "Enter reason for rejection:",
        async (reason: string) => {
          setActionLoading(true);
          try {
            await rejectRequest(activeStore, req, user?.uid || "", user?.displayName || "", reason);
          } catch (e: unknown) {
            Alert.alert("Error", e instanceof Error ? e.message : "Failed");
          }
          setActionLoading(false);
        }
      );
    } else {
      handleRejectFallback(req);
    }
  };

  const handleRejectFallback = async (req: StoreRequest) => {
    Alert.alert("Reject Request", `Reject ${req.request_id}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject",
        style: "destructive",
        onPress: async () => {
          setActionLoading(true);
          try {
            await rejectRequest(activeStore, req, user?.uid || "", user?.displayName || "", "Rejected via mobile");
          } catch (e: unknown) {
            Alert.alert("Error", e instanceof Error ? e.message : "Failed");
          }
          setActionLoading(false);
        },
      },
    ]);
  };

  const handleIssue = async (req: StoreRequest) => {
    // Navigate to the scan-and-issue screen with request data
    router.push(
      `/(store)/issue-scan?store=${activeStore.type}&requestId=${encodeURIComponent(req.request_id)}&requestDocId=${req.id}&requestedBy=${encodeURIComponent(req.requested_by)}&requestedByName=${encodeURIComponent(req.requested_by_name)}&requestedAt=${encodeURIComponent(req.requested_at)}&items=${encodeURIComponent(JSON.stringify(req.items))}&notes=${encodeURIComponent(req.notes || "")}` as never
    );
  };

  const renderRequest = ({ item: req }: { item: StoreRequest }) => {
    const isExpanded = expandedId === req.id;
    return (
      <TouchableOpacity
        style={styles.reqCard}
        activeOpacity={0.7}
        onPress={() => setExpandedId(isExpanded ? null : req.id)}
      >
        <View style={styles.reqHeader}>
          <View style={styles.reqInfo}>
            <Text style={styles.reqId}>{req.request_id}</Text>
            <Text style={styles.reqBy}>{req.requested_by_name}</Text>
            <Text style={styles.reqDate}>
              {new Date(req.requested_at).toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.reqRight}>
            <StatusBadge status={req.status} />
            <Text style={styles.reqItemCount}>{req.items.length} items</Text>
          </View>
        </View>

        {isExpanded && (
          <View style={styles.reqExpanded}>
            {req.items.map((it, idx) => (
              <View key={idx} style={styles.reqItemRow}>
                <Text style={styles.reqItemName} numberOfLines={1}>{it.name}</Text>
                <Text style={styles.reqItemQty}>
                  {it.qty_approved > 0 ? `${it.qty_approved}/` : ""}{it.qty_requested}
                </Text>
              </View>
            ))}

            {req.notes ? (
              <Text style={styles.reqNotes}>Note: {req.notes}</Text>
            ) : null}

            {/* Actions */}
            {req.status === "pending" && (
              <View style={styles.reqActions}>
                <TouchableOpacity
                  style={[styles.reqActionBtn, { backgroundColor: colors.success + "15" }]}
                  onPress={() => handleApprove(req)}
                  disabled={actionLoading}
                >
                  <Text style={[styles.reqActionText, { color: colors.success }]}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.reqActionBtn, { backgroundColor: colors.danger + "15" }]}
                  onPress={() => handleReject(req)}
                  disabled={actionLoading}
                >
                  <Text style={[styles.reqActionText, { color: colors.danger }]}>Reject</Text>
                </TouchableOpacity>
              </View>
            )}
            {req.status === "approved" && (
              <TouchableOpacity
                style={[styles.reqActionBtn, { backgroundColor: colors.primary + "15" }]}
                onPress={() => handleIssue(req)}
                disabled={actionLoading}
              >
                <Text style={[styles.reqActionText, { color: colors.primary }]}>Issue Items</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Requests</Text>
        {access.general && access.it && (
          <View style={styles.miniSwitcher}>
            <TouchableOpacity
              style={[styles.miniBtn, activeStore.type === "general" && styles.miniBtnActive]}
              onPress={() => setActiveStore(GENERAL_STORE_CONFIG)}
            >
              <Text style={[styles.miniText, activeStore.type === "general" && styles.miniTextActive]}>GS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.miniBtn, activeStore.type === "it" && styles.miniBtnActive]}
              onPress={() => setActiveStore(IT_STORE_CONFIG)}
            >
              <Text style={[styles.miniText, activeStore.type === "it" && styles.miniTextActive]}>IT</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Status Tabs */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={STATUS_TABS}
        style={styles.tabList}
        contentContainerStyle={styles.tabContent}
        keyExtractor={(t) => t.label}
        renderItem={({ item: tab }) => {
          const active = statusFilter === tab.value;
          return (
            <TouchableOpacity
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setStatusFilter(tab.value)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Requests List */}
      <FlatList
        data={requests}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        renderItem={renderRequest}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="clipboard-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>{loading ? "Loading..." : "No requests"}</Text>
          </View>
        }
      />

      {/* New Request FAB */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.8}
        onPress={() => router.push("/(store)/new-request" as never)}
      >
        <Ionicons name="add" size={28} color={colors.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: fontSize["2xl"], fontWeight: "700", color: colors.text },
  miniSwitcher: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 2,
  },
  miniBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm },
  miniBtnActive: { backgroundColor: colors.primary },
  miniText: { fontSize: fontSize.xs, fontWeight: "600", color: colors.textSecondary },
  miniTextActive: { color: colors.white },
  tabList: { maxHeight: 44, marginBottom: spacing.sm },
  tabContent: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: fontSize.sm, fontWeight: "600", color: colors.textSecondary },
  tabTextActive: { color: colors.white },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 20 },
  reqCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  reqHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  reqInfo: { flex: 1 },
  reqId: { fontSize: fontSize.sm, fontWeight: "700", color: colors.text },
  reqBy: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  reqDate: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  reqRight: { alignItems: "flex-end", gap: spacing.xs },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full },
  statusText: { fontSize: fontSize.xs, fontWeight: "700", textTransform: "capitalize" },
  reqItemCount: { fontSize: fontSize.xs, color: colors.textMuted },
  reqExpanded: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  reqItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reqItemName: { flex: 1, fontSize: fontSize.sm, color: colors.text },
  reqItemQty: { fontSize: fontSize.sm, fontWeight: "700", color: colors.primary },
  reqNotes: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: "italic" },
  reqActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  reqActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: "center",
  },
  reqActionText: { fontSize: fontSize.sm, fontWeight: "700" },
  empty: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyText: { fontSize: fontSize.base, color: colors.textSecondary },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
});
