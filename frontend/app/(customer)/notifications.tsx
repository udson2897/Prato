import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, registerThemedStyles } from "@/src/theme";
import { api } from "@/src/lib/api";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

const ICONS: Record<string, string> = {
  status: "notifications",
  new_order: "receipt",
  order: "notifications",
};

export default function Notifications() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const n = await api.notifications();
      setItems(n);
      await api.readAllNotifications();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="notifications-back">
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Avisos</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={56} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>Nenhum aviso ainda</Text>
            <Text style={styles.emptySub}>Você será avisado a cada mudança do seu pedido</Text>
          </View>
        ) : (
          items.map((n) => (
            <Pressable
              key={n.id}
              testID={`notification-${n.id}`}
              style={[styles.card, !n.read && styles.cardUnread]}
              onPress={() => { if (n.order_id) router.push(`/(customer)/track/${n.order_id}`); }}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={(ICONS[n.type] || "notifications") as any} size={20} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{n.title}</Text>
                <Text style={styles.cardBody}>{n.body}</Text>
                <Text style={styles.cardTime}>{timeAgo(n.created_at)}</Text>
              </View>
              {!n.read && <View style={styles.dot} />}
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  card: { flexDirection: "row", gap: spacing.md, alignItems: "center", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  cardUnread: { backgroundColor: colors.brandTertiary, borderColor: colors.brandSecondary },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.base },
  cardBody: { color: colors.onSurfaceSecondary, marginTop: 2, fontSize: font.size.sm },
  cardTime: { color: colors.onSurfaceTertiary, marginTop: 4, fontSize: font.size.sm },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
  empty: { alignItems: "center", padding: spacing.xxl },
  emptyText: { color: colors.onSurface, fontWeight: "700", marginTop: spacing.sm, fontSize: font.size.lg },
  emptySub: { color: colors.onSurfaceSecondary, marginTop: 4, textAlign: "center" },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
