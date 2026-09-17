import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, brl, registerThemedStyles } from "@/src/theme";
import { api } from "@/src/lib/api";

function todayISO() {
  // date in America/Sao_Paulo
  const now = new Date();
  const br = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const y = br.getFullYear();
  const m = String(br.getMonth() + 1).padStart(2, "0");
  const d = String(br.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function labelForDate(iso: string) {
  const t = todayISO();
  if (iso === t) return "Hoje";
  if (iso === shiftISO(t, -1)) return "Ontem";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function CourierReport() {
  const router = useRouter();
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      setData(await api.courierReport(d));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(date); }, [date, load]));

  const isToday = date === todayISO();
  const couriers = data?.couriers || [];
  const unassigned = data?.unassigned;
  const totals = data?.totals || { deliveries: 0, to_pay: 0 };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="report-back"><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>Pagamento de Entregadores</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.dateBar}>
        <Pressable testID="report-prev-day" style={styles.dateBtn} onPress={() => setDate((d) => shiftISO(d, -1))}>
          <Ionicons name="chevron-back" size={20} color={colors.brand} />
        </Pressable>
        <View style={styles.dateCenter}>
          <Text style={styles.dateLabel}>{labelForDate(date)}</Text>
          {labelForDate(date) !== date.split("-").reverse().join("/") && (
            <Text style={styles.dateSub}>{date.split("-").reverse().join("/")}</Text>
          )}
        </View>
        <Pressable
          testID="report-next-day"
          style={[styles.dateBtn, isToday && styles.dateBtnDisabled]}
          disabled={isToday}
          onPress={() => setDate((d) => shiftISO(d, 1))}
        >
          <Ionicons name="chevron-forward" size={20} color={isToday ? colors.onSurfaceTertiary : colors.brand} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(date); }} tintColor={colors.brand} />}
      >
        <View style={styles.summary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{totals.deliveries}</Text>
            <Text style={styles.summaryLabel}>Entregas</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: colors.success }]}>{brl(totals.to_pay)}</Text>
            <Text style={styles.summaryLabel}>Total a pagar</Text>
          </View>
        </View>
        <Text style={styles.hint}>A taxa de entrega de cada pedido é o valor a pagar ao entregador.</Text>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
        ) : couriers.length === 0 && (!unassigned || unassigned.deliveries === 0) ? (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={56} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>Nenhuma entrega finalizada neste dia</Text>
          </View>
        ) : (
          <>
            {couriers.map((g: any) => {
              const open = expanded === g.courier.id;
              return (
                <View key={g.courier.id} style={styles.card} testID={`report-courier-${g.courier.id}`}>
                  <Pressable style={styles.cardTop} onPress={() => setExpanded(open ? null : g.courier.id)}>
                    <View style={styles.avatar}><Ionicons name="person" size={20} color={colors.brand} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{g.courier.name}</Text>
                      <Text style={styles.meta}>Placa {g.courier.plate} • {g.deliveries} entrega{g.deliveries !== 1 ? "s" : ""}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.pay}>{brl(g.total_fee)}</Text>
                      <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.onSurfaceTertiary} />
                    </View>
                  </Pressable>
                  {open && (
                    <View style={styles.orders}>
                      {g.orders.map((o: any) => (
                        <View key={o.id} style={styles.orderRow}>
                          <Text style={styles.orderCode}>#{o.code}</Text>
                          <Text style={styles.orderName} numberOfLines={1}>{o.customer_name}</Text>
                          <Text style={styles.orderFee}>{brl(o.delivery_fee)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}

            {unassigned && unassigned.deliveries > 0 && (
              <View style={[styles.card, styles.cardWarn]} testID="report-unassigned">
                <Pressable style={styles.cardTop} onPress={() => setExpanded(expanded === "__un" ? null : "__un")}>
                  <View style={[styles.avatar, { backgroundColor: colors.warning + "22" }]}><Ionicons name="alert" size={20} color={colors.warning} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>Sem entregador atribuído</Text>
                    <Text style={styles.meta}>{unassigned.deliveries} entrega{unassigned.deliveries !== 1 ? "s" : ""} • atribua para controlar o pagamento</Text>
                  </View>
                  <Text style={[styles.pay, { color: colors.warning }]}>{brl(unassigned.total_fee)}</Text>
                </Pressable>
                {expanded === "__un" && (
                  <View style={styles.orders}>
                    {unassigned.orders.map((o: any) => (
                      <View key={o.id} style={styles.orderRow}>
                        <Text style={styles.orderCode}>#{o.code}</Text>
                        <Text style={styles.orderName} numberOfLines={1}>{o.customer_name}</Text>
                        <Text style={styles.orderFee}>{brl(o.delivery_fee)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  dateBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  dateBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  dateBtnDisabled: { backgroundColor: colors.surfaceSecondary },
  dateCenter: { alignItems: "center" },
  dateLabel: { fontSize: font.size.lg, fontWeight: "800", color: colors.onSurface },
  dateSub: { fontSize: font.size.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  summary: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryDivider: { width: 1, height: 40, backgroundColor: colors.border },
  summaryValue: { fontSize: font.size.xxl, fontWeight: "800", color: colors.onSurface },
  summaryLabel: { color: colors.onSurfaceSecondary, marginTop: 2, fontSize: font.size.sm },
  hint: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, marginTop: spacing.sm, marginBottom: spacing.md, fontStyle: "italic" },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  cardWarn: { borderColor: colors.warning },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  name: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
  meta: { color: colors.onSurfaceSecondary, marginTop: 2, fontSize: font.size.sm },
  pay: { fontWeight: "800", color: colors.success, fontSize: font.size.lg },
  orders: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm, gap: spacing.xs },
  orderRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 4 },
  orderCode: { fontWeight: "700", color: colors.brand, width: 70, fontSize: font.size.sm },
  orderName: { flex: 1, color: colors.onSurfaceSecondary, fontSize: font.size.sm },
  orderFee: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.sm },
  empty: { alignItems: "center", padding: spacing.xxl },
  emptyText: { color: colors.onSurfaceSecondary, marginTop: spacing.sm, fontSize: font.size.lg, textAlign: "center" },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
