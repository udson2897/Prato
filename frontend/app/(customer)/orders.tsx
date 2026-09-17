import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { colors, spacing, radius, font, brl, STATUS_LABELS, STATUS_COLORS, registerThemedStyles } from "@/src/theme";
import { api } from "@/src/lib/api";

export default function Orders() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const o = await api.myOrders();
      setOrders(o);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Meus Pedidos</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : orders.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nenhum pedido ainda</Text>
            <Text style={styles.emptySub}>Faça seu primeiro pedido em uma loja!</Text>
          </View>
        ) : (
          orders.map((o) => (
            <Pressable
              key={o.id}
              testID={`order-${o.id}`}
              style={styles.card}
              onPress={() => router.push(`/(customer)/track/${o.id}`)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.storeName}>{o.store_name}</Text>
                <View style={[styles.statusPill, { backgroundColor: (STATUS_COLORS[o.status] || colors.info) + "22" }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLORS[o.status] || colors.info }]}>
                    {STATUS_LABELS[o.status] || o.status}
                  </Text>
                </View>
              </View>
              <Text style={styles.itemsText} numberOfLines={2}>
                {o.items.map((i: any) => `${i.quantity}x ${i.name}`).join(", ")}
              </Text>
              <View style={styles.cardFooter}>
                <Text style={styles.total}>{brl(o.total)}</Text>
                <Text style={styles.date}>{new Date(o.created_at).toLocaleDateString("pt-BR")}</Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  title: { fontSize: font.size.xxl, fontWeight: "800", color: colors.onSurface },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.md,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  storeName: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface, flex: 1 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  statusText: { fontSize: font.size.sm, fontWeight: "700" },
  itemsText: { color: colors.onSurfaceSecondary, marginTop: spacing.xs, fontSize: font.size.sm },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  total: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
  date: { color: colors.onSurfaceTertiary, fontSize: font.size.sm },
  empty: { alignItems: "center", padding: spacing.xxl },
  emptyTitle: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  emptySub: { color: colors.onSurfaceSecondary, marginTop: 4, textAlign: "center" },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
