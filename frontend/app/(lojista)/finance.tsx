import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, brl, registerThemedStyles } from "@/src/theme";
import { api } from "@/src/lib/api";

function todayISO() {
  const br = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return `${br.getFullYear()}-${String(br.getMonth() + 1).padStart(2, "0")}-${String(br.getDate()).padStart(2, "0")}`;
}
function shiftISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function label(iso: string) {
  const t = todayISO();
  if (iso === t) return "Hoje";
  if (iso === shiftISO(t, -1)) return "Ontem";
  return iso.split("-").reverse().join("/");
}

function PeriodCard({ title, icon, data }: { title: string; icon: any; data: any }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}><Ionicons name={icon} size={18} color={colors.brand} /></View>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardCount}>{data?.count || 0} pedido{(data?.count || 0) !== 1 ? "s" : ""}</Text>
      </View>
      <Text style={styles.revenue}>{brl(data?.revenue || 0)}</Text>
      <Text style={styles.revenueLabel}>Faturamento (produtos)</Text>
      <View style={styles.subRow}>
        <View style={styles.subItem}>
          <Text style={styles.subVal}>{brl(data?.total || 0)}</Text>
          <Text style={styles.subLbl}>Total recebido</Text>
        </View>
        <View style={styles.subItem}>
          <Text style={styles.subVal}>{brl(data?.delivery || 0)}</Text>
          <Text style={styles.subLbl}>Taxas de entrega</Text>
        </View>
      </View>
    </View>
  );
}

export default function Finance() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [date, setDate] = useState(todayISO());

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try { setData(await api.finance(d)); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(date); }, [date, load]));

  const isToday = date === todayISO();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="finance-back"><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>Relatório Financeiro</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(date); }} tintColor={colors.brand} />}
      >
        {loading && !data ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
        ) : data ? (
          <>
            <PeriodCard title="Hoje" icon="today" data={data.today} />
            <PeriodCard title="Esta semana" icon="calendar" data={data.week} />
            <PeriodCard title="Este mês" icon="calendar-clear" data={data.month} />

            <Text style={styles.sectionTitle}>Faturamento por dia</Text>
            <View style={styles.dateBar}>
              <Pressable testID="finance-prev" style={styles.dateBtn} onPress={() => setDate((d) => shiftISO(d, -1))}>
                <Ionicons name="chevron-back" size={20} color={colors.brand} />
              </Pressable>
              <Text style={styles.dateLabel}>{label(date)}</Text>
              <Pressable testID="finance-next" style={[styles.dateBtn, isToday && { opacity: 0.4 }]} disabled={isToday} onPress={() => setDate((d) => shiftISO(d, 1))}>
                <Ionicons name="chevron-forward" size={20} color={colors.brand} />
              </Pressable>
            </View>
            <PeriodCard title={label(date)} icon="cash" data={data.selected || { count: 0, revenue: 0, delivery: 0, total: 0 }} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.md },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  cardIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  cardTitle: { flex: 1, fontWeight: "800", color: colors.onSurface, fontSize: font.size.lg },
  cardCount: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, fontWeight: "600" },
  revenue: { fontSize: font.size.huge, fontWeight: "800", color: colors.success },
  revenueLabel: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, marginBottom: spacing.md },
  subRow: { flexDirection: "row", gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md },
  subItem: { flex: 1 },
  subVal: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
  subLbl: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, marginTop: 2 },
  sectionTitle: { fontWeight: "800", color: colors.onSurface, fontSize: font.size.lg, marginTop: spacing.md, marginBottom: spacing.sm },
  dateBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, padding: 4, marginBottom: spacing.md },
  dateBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  dateLabel: { fontSize: font.size.lg, fontWeight: "800", color: colors.onSurface },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
