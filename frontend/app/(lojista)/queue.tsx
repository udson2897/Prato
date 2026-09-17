import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, brl, STATUS_LABELS, STATUS_COLORS, registerThemedStyles } from "@/src/theme";
import { api } from "@/src/lib/api";
import { useNewOrderSound } from "@/src/hooks/use-new-order-sound";

const NEXT_ACTION: Record<string, { status: string; label: string } | null> = {
  AGUARDANDO_CONFIRMACAO: { status: "ACEITO", label: "Aceitar pedido" },
  ACEITO: { status: "EM_PREPARO", label: "Iniciar preparo" },
  EM_PREPARO: { status: "SAIU_PARA_ENTREGA", label: "Saiu para entrega" },
  SAIU_PARA_ENTREGA: { status: "FINALIZADO", label: "Finalizar" },
  FINALIZADO: null,
  CANCELADO: null,
};

const FILTERS = ["ATIVOS", "AGUARDANDO_CONFIRMACAO", "EM_PREPARO", "FINALIZADO"];

export default function Queue() {
  const router = useRouter();
  const { orders, loading, reload, newIds, newCount, clearNew, clearAllNew } = useNewOrderSound(10000);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("ATIVOS");

  const load = useCallback(async () => {
    await reload();
    setRefreshing(false);
  }, [reload]);

  const advance = async (order: any) => {
    const next = NEXT_ACTION[order.status];
    if (!next) return;
    clearNew(order.id);
    await api.updateOrderStatus(order.id, next.status);
    load();
  };

  const filtered = orders
    .filter((o) => {
      if (filter === "ATIVOS") return ["AGUARDANDO_CONFIRMACAO", "ACEITO", "EM_PREPARO", "SAIU_PARA_ENTREGA"].includes(o.status);
      return o.status === filter;
    })
    .sort((a, b) => {
      const ar = a.courier_refused && !a.courier ? 1 : 0;
      const br = b.courier_refused && !b.courier ? 1 : 0;
      return br - ar; // recusados primeiro
    });

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Fila de Pedidos</Text>
      </View>

      {newCount > 0 && (
        <Pressable
          testID="queue-new-banner"
          style={styles.newBanner}
          onPress={() => { setFilter("AGUARDANDO_CONFIRMACAO"); clearAllNew(); }}
        >
          <Ionicons name="notifications" size={18} color="#fff" />
          <Text style={styles.newBannerText}>
            {newCount} novo{newCount !== 1 ? "s" : ""} pedido{newCount !== 1 ? "s" : ""}!
          </Text>
          <Text style={styles.newBannerCta}>Ver</Text>
        </Pressable>
      )}

      <View style={styles.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {FILTERS.map((f) => (
            <Pressable
              key={f}
              testID={`queue-filter-${f}`}
              style={[styles.chip, filter === f && styles.chipActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
                {f === "ATIVOS" ? "Ativos" : STATUS_LABELS[f] || f}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-circle-outline" size={56} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>
              {filter === "ATIVOS" ? "Nenhum pedido ativo no momento" : "Nenhum pedido aqui"}
            </Text>
            {filter === "ATIVOS" && orders.length > 0 && (
              <Text style={styles.emptySub}>
                Você tem {orders.length} pedido{orders.length !== 1 ? "s" : ""} no total. Toque em Finalizado para ver os concluídos.
              </Text>
            )}
            <Pressable style={styles.reloadBtn} onPress={() => { load(); }} testID="queue-reload">
              <Ionicons name="refresh" size={16} color={colors.brand} />
              <Text style={styles.reloadText}>Atualizar</Text>
            </Pressable>
          </View>
        ) : (
          filtered.map((o) => {
            const next = NEXT_ACTION[o.status];
            const refused = o.courier_refused && !o.courier;
            const active = ["AGUARDANDO_CONFIRMACAO", "ACEITO", "EM_PREPARO", "SAIU_PARA_ENTREGA"].includes(o.status);
            const isNew = newIds.includes(o.id);
            return (
              <View key={o.id} style={[styles.card, refused && active && styles.cardRefused, isNew && styles.cardNew]} testID={`queue-order-${o.id}`}>
                <Pressable onPress={() => { clearNew(o.id); router.push(`/(lojista)/order/${o.id}`); }}>
                  <View style={styles.cardTop}>
                    <View style={styles.customerWrap}>
                      {isNew && (
                        <View style={styles.newBadge} testID={`queue-new-badge-${o.id}`}>
                          <Text style={styles.newBadgeText}>NOVO</Text>
                        </View>
                      )}
                      <Text style={styles.customer} numberOfLines={1}>{o.customer_name}{o.code ? ` • #${o.code}` : ""}</Text>
                    </View>
                    <View style={[styles.pill, { backgroundColor: (STATUS_COLORS[o.status] || colors.info) + "22" }]}>
                      <Text style={[styles.pillText, { color: STATUS_COLORS[o.status] || colors.info }]}>{STATUS_LABELS[o.status]}</Text>
                    </View>
                  </View>
                  {o.store_name ? (
                    <View style={styles.storeRow}>
                      <Ionicons name="storefront-outline" size={13} color={colors.onSurfaceSecondary} />
                      <Text style={styles.storeName}>{o.store_name}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.items} numberOfLines={2}>
                    {o.items.map((i: any) => `${i.quantity}x ${i.name}`).join(", ")}
                  </Text>
                  <Text style={styles.total}>{brl(o.total)} • {o.payment_method}</Text>
                  {active && !refused && o.courier && (
                    <View style={styles.courierRow}>
                      <Ionicons name="bicycle" size={14} color={colors.success} />
                      <Text style={styles.courierOk}>Entregador: {o.courier.name}</Text>
                    </View>
                  )}
                  {active && !refused && !o.courier && o.courier_offer?.status === "pending" && (
                    <View style={styles.courierRow}>
                      <Ionicons name="hourglass-outline" size={14} color={colors.warning} />
                      <Text style={styles.courierWait}>Aguardando {o.courier_offer.courier_name} aceitar…</Text>
                    </View>
                  )}
                </Pressable>
                {active && refused && (
                  <View style={styles.refusedBanner} testID={`queue-refused-${o.id}`}>
                    <Ionicons name="close-circle" size={18} color={colors.error} />
                    <Text style={styles.refusedText}>{o.courier_refused.courier_name} recusou — atribua a outro</Text>
                    <Pressable style={styles.reassignBtn} onPress={() => router.push(`/(lojista)/order/${o.id}?assign=1`)} testID={`queue-reassign-${o.id}`}>
                      <Text style={styles.reassignText}>Reatribuir</Text>
                    </Pressable>
                  </View>
                )}
                {next && (
                  <View style={styles.actionsRow}>
                    <Pressable
                      testID={`queue-advance-${o.id}`}
                      style={styles.advanceBtn}
                      onPress={() => advance(o)}
                    >
                      <Text style={styles.advanceText}>{next.label}</Text>
                    </Pressable>
                    {o.status === "AGUARDANDO_CONFIRMACAO" && (
                      <Pressable
                        testID={`queue-reject-${o.id}`}
                        style={styles.rejectBtn}
                        onPress={async () => { clearNew(o.id); await api.updateOrderStatus(o.id, "CANCELADO"); load(); }}
                      >
                        <Ionicons name="close" size={20} color={colors.error} />
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: font.size.xxl, fontWeight: "800", color: colors.onSurface },
  chipsWrap: { height: 56, borderBottomWidth: 1, borderBottomColor: colors.divider },
  chipsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" },
  chip: {
    flexShrink: 0, height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.onSurface, fontWeight: "600", fontSize: font.size.sm },
  chipTextActive: { color: "#fff" },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  cardNew: { borderColor: colors.brand, borderWidth: 1.5, backgroundColor: colors.brandTertiary },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  customerWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1, paddingRight: spacing.sm },
  customer: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg, flexShrink: 1 },
  newBadge: { backgroundColor: colors.brand, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  newBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  newBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brand, marginHorizontal: spacing.lg, marginBottom: spacing.sm, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  newBannerText: { color: "#fff", fontWeight: "800", fontSize: font.size.lg, flex: 1 },
  newBannerCta: { color: "#fff", fontWeight: "700", fontSize: font.size.sm, textDecorationLine: "underline" },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { fontWeight: "700", fontSize: font.size.sm },
  storeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  storeName: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, fontWeight: "600" },
  courierRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  courierOk: { color: colors.success, fontSize: font.size.sm, fontWeight: "600" },
  courierWait: { color: colors.warning, fontSize: font.size.sm, fontWeight: "600" },
  cardRefused: { borderColor: colors.error, borderWidth: 1.5 },
  refusedBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.error + "14", borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm },
  refusedText: { flex: 1, color: colors.error, fontWeight: "700", fontSize: font.size.sm },
  reassignBtn: { backgroundColor: colors.error, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  reassignText: { color: "#fff", fontWeight: "800", fontSize: font.size.sm },
  items: { color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  total: { color: colors.onSurface, fontWeight: "700", marginTop: spacing.xs },
  actionsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  advanceBtn: { flex: 1, backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center" },
  advanceText: { color: "#fff", fontWeight: "700" },
  rejectBtn: { width: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: spacing.xxl },
  emptyText: { color: colors.onSurfaceSecondary, marginTop: spacing.sm, fontSize: font.size.lg, fontWeight: "700" },
  emptySub: { color: colors.onSurfaceSecondary, marginTop: spacing.xs, fontSize: font.size.sm, textAlign: "center", paddingHorizontal: spacing.lg },
  reloadBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand },
  reloadText: { color: colors.brand, fontWeight: "700" },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
