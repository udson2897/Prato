import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Animated, Easing } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, brl, ORDER_FLOW, STATUS_LABELS,
  STATUS_COLORS, STATUS_DESC, STATUS_ICONS, registerThemedStyles } from "@/src/theme";
import { api } from "@/src/lib/api";
import LiveMap from "@/src/components/LiveMap";

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function Track() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      const o = await api.order(id as string);
      setOrder(o);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  if (loading || !order) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.brand} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  const currentIdx = ORDER_FLOW.indexOf(order.status);
  const cancelled = order.status === "CANCELADO";
  const finalized = order.status === "FINALIZADO";
  const statusColor = STATUS_COLORS[order.status] || colors.info;
  const progress = cancelled ? 0 : (currentIdx + 1) / ORDER_FLOW.length;

  // ETA calc
  const createdMs = new Date(order.created_at).getTime();
  const etaMs = createdMs + (order.est_delivery_min || 30) * 60000;
  const remainingMin = Math.max(0, Math.round((etaMs - Date.now()) / 60000));
  const etaClock = new Date(etaMs).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  // map status -> timestamp
  const timeFor: Record<string, string> = {};
  for (const h of order.status_history || []) timeFor[h.status] = h.at;

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="track-back">
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Acompanhar pedido</Text>
        <Pressable onPress={() => router.push(`/(customer)/chat/${order.id}`)} testID="track-open-chat">
          <Ionicons name="chatbubble-ellipses" size={22} color={colors.brand} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}>
        {/* HERO status card */}
        <View style={[styles.hero, { backgroundColor: cancelled ? colors.error + "12" : statusColor + "14" }]} testID="track-hero">
          <View style={styles.heroIconWrap}>
            {!cancelled && !finalized && (
              <Animated.View style={[styles.pulseRing, { backgroundColor: statusColor, transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
            )}
            <View style={[styles.heroIcon, { backgroundColor: statusColor }]}>
              <Ionicons name={(STATUS_ICONS[order.status] || "time-outline") as any} size={30} color="#fff" />
            </View>
          </View>
          <Text style={[styles.heroStatus, { color: cancelled ? colors.error : statusColor }]} testID="track-current-status">
            {STATUS_LABELS[order.status]}
          </Text>
          <Text style={styles.heroDesc}>{STATUS_DESC[order.status]}</Text>

          {!cancelled && !finalized && (
            <View style={styles.etaBox} testID="track-eta">
              <Ionicons name="time-outline" size={18} color={colors.onSurface} />
              <Text style={styles.etaText}>
                {remainingMin > 0 ? `Chega em ~${remainingMin} min` : "Chegando agora"} • previsão {etaClock}
              </Text>
            </View>
          )}

          {!cancelled && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: statusColor }]} />
            </View>
          )}
        </View>

        <View style={styles.storeRow}>
          <Ionicons name="storefront-outline" size={18} color={colors.onSurfaceSecondary} />
          <Text style={styles.storeName}>{order.store_name}</Text>
          {order.code ? <Text style={styles.orderCode}>#{order.code}</Text> : null}
        </View>

        {order.status === "SAIU_PARA_ENTREGA" && order.code && order.address?.lat != null && (
          <View style={styles.mapCard} testID="track-live-map">
            <View style={styles.mapHeadRow}>
              <Text style={styles.mapTitle}>Entregador a caminho 🛵</Text>
              {(() => {
                const cl = order.courier_location;
                if (!cl || cl.lat == null) {
                  return <Text style={styles.liveEtaWait}>aguardando GPS…</Text>;
                }
                const distKm = haversineKm(cl.lat, cl.lng, order.address.lat, order.address.lng);
                const mins = Math.max(1, Math.round(distKm / (22 / 60)));
                const distStr = distKm < 1
                  ? `${Math.round(distKm * 1000)} m`
                  : `${distKm.toFixed(1).replace(".", ",")} km`;
                return (
                  <View style={styles.liveEtaPill} testID="track-live-eta">
                    <Ionicons name="navigate" size={13} color={colors.brand} />
                    <Text style={styles.liveEtaText}>{distStr} • ~{mins} min</Text>
                  </View>
                );
              })()}
            </View>
            <LiveMap
              code={order.code}
              dest={{ lat: order.address.lat, lng: order.address.lng }}
              store={null}
              height={240}
            />
          </View>
        )}

        {/* Timeline with timestamps */}
        {!cancelled ? (
          <View style={styles.timeline}>
            {ORDER_FLOW.map((st, idx) => {
              const done = idx <= currentIdx;
              const active = idx === currentIdx && !finalized;
              const ts = timeFor[st];
              return (
                <View key={st} style={styles.step} testID={`track-step-${st}`}>
                  <View style={styles.stepLeft}>
                    <View
                      style={[
                        styles.dot,
                        done && { backgroundColor: statusColor, borderColor: statusColor },
                        active && { transform: [{ scale: 1.15 }] },
                      ]}
                    >
                      {done ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                    </View>
                    {idx < ORDER_FLOW.length - 1 && (
                      <View style={[styles.stepLine, done && { backgroundColor: statusColor }]} />
                    )}
                  </View>
                  <View style={{ flex: 1, paddingBottom: spacing.lg }}>
                    <View style={styles.stepHeadRow}>
                      <Text style={[styles.stepLabel, done && { color: colors.onSurface, fontWeight: "700" }]}>
                        {STATUS_LABELS[st]}
                      </Text>
                      {ts ? <Text style={styles.stepTime}>{formatTime(ts)}</Text> : null}
                    </View>
                    {active && <Text style={styles.stepHint}>{STATUS_DESC[st]}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.cancelBox}>
            <Ionicons name="close-circle" size={40} color={colors.error} />
            <Text style={styles.cancelText}>Pedido cancelado</Text>
            {timeFor["CANCELADO"] ? <Text style={styles.stepTime}>{formatTime(timeFor["CANCELADO"])}</Text> : null}
          </View>
        )}

        <View style={styles.itemsCard}>
          <Text style={styles.sectionTitle}>Resumo</Text>
          {order.items.map((it: any, i: number) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemQty}>{it.quantity}×</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{it.name}</Text>
                {it.options && it.options.length > 0 && (
                  <Text style={styles.itemOptions}>{it.options.join(" • ")}</Text>
                )}
              </View>
              <Text style={styles.itemPrice}>{brl(it.line_total)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <Row label="Subtotal" value={brl(order.subtotal)} />
          <Row label="Entrega" value={brl(order.delivery_fee)} />
          {order.discount > 0 && <Row label="Desconto" value={`- ${brl(order.discount)}`} />}
          {order.points_discount > 0 && <Row label={`Pontos (${order.points_redeemed})`} value={`- ${brl(order.points_discount)}`} />}
          <Row label="Total" value={brl(order.total)} bold />
          <Text style={styles.paymentText}>Pagamento: {order.payment_method}</Text>
          {order.points_earned > 0 && order.status === "FINALIZADO" && (
            <Text style={styles.earnedText}>+{order.points_earned} pontos ganhos 🎉</Text>
          )}
        </View>

        {order.address && (
          <View style={styles.addrCard}>
            <Ionicons name="location" size={18} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.addrLabel}>Entregar em {order.address.label}</Text>
              <Text style={styles.addrText}>{order.address.street}, {order.address.number} - {order.address.city}/{order.address.state}</Text>
            </View>
          </View>
        )}

        {order.status === "SAIU_PARA_ENTREGA" && (
          <View style={styles.confirmCard} testID="track-confirm-card">
            <Text style={styles.confirmTitle}>Chegou o seu pedido?</Text>
            <Text style={styles.confirmHint}>
              Toque abaixo quando receber. Se você não confirmar, marcaremos como entregue automaticamente 30 min após a previsão.
            </Text>
            <Pressable
              testID="track-confirm-receipt"
              style={styles.confirmBtn}
              disabled={confirming}
              onPress={async () => {
                setConfirming(true);
                try {
                  await api.updateOrderStatus(order.id, "FINALIZADO");
                  await load();
                } finally {
                  setConfirming(false);
                }
              }}
            >
              {confirming ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.confirmBtnText}>Confirmar recebimento</Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {order.status === "AGUARDANDO_CONFIRMACAO" && (
          <Pressable
            testID="track-cancel"
            style={styles.cancelBtn}
            onPress={async () => { await api.updateOrderStatus(order.id, "CANCELADO"); load(); }}
          >
            <Text style={styles.cancelBtnText}>Cancelar pedido</Text>
          </Pressable>
        )}

        {finalized && !order.rating && (
          <View style={styles.ratingBox}>
            <Text style={styles.ratingTitle}>Como foi seu pedido?</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "center", marginTop: spacing.md }}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Pressable key={s} testID={`rate-${s}`} onPress={async () => { await api.rateOrder(order.id, s); load(); }}>
                  <Ionicons name="star" size={32} color={colors.warning} />
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.sumRow}>
      <Text style={[styles.sumLabel, bold && { fontWeight: "800", color: colors.onSurface }]}>{label}</Text>
      <Text style={[styles.sumValue, bold && { fontWeight: "800", color: colors.brand, fontSize: 18 }]}>{value}</Text>
    </View>
  );
}

const makeStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  title: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  hero: { borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", marginBottom: spacing.lg },
  heroIconWrap: { width: 64, height: 64, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  pulseRing: { position: "absolute", width: 60, height: 60, borderRadius: 30 },
  heroIcon: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  heroStatus: { fontSize: font.size.xl, fontWeight: "800" },
  heroDesc: { color: colors.onSurfaceSecondary, textAlign: "center", marginTop: spacing.xs, fontSize: font.size.base },
  etaBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, marginTop: spacing.md },
  etaText: { color: colors.onSurface, fontWeight: "600", fontSize: font.size.sm },
  progressTrack: { width: "100%", height: 6, borderRadius: 3, backgroundColor: colors.surface, marginTop: spacing.lg, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  storeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  storeName: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  orderCode: { marginLeft: "auto", color: colors.onSurfaceTertiary, fontWeight: "700" },
  mapCard: { marginBottom: spacing.lg },
  mapHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  mapTitle: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
  liveEtaPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 },
  liveEtaText: { color: colors.brand, fontWeight: "700", fontSize: font.size.sm },
  liveEtaWait: { color: colors.onSurfaceTertiary, fontSize: font.size.sm, fontStyle: "italic" },
  timeline: { marginVertical: spacing.xs },
  step: { flexDirection: "row", gap: spacing.md },
  stepLeft: { alignItems: "center", width: 24 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  stepLine: { width: 2, flex: 1, backgroundColor: colors.borderStrong, minHeight: 24 },
  stepHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stepLabel: { color: colors.onSurfaceSecondary, fontSize: font.size.lg },
  stepTime: { color: colors.onSurfaceTertiary, fontSize: font.size.sm, fontWeight: "600" },
  stepHint: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, marginTop: 2 },
  cancelBox: { alignItems: "center", padding: spacing.xl, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, marginBottom: spacing.lg },
  cancelText: { color: colors.error, fontWeight: "700", marginTop: spacing.sm, fontSize: font.size.lg },
  itemsCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.md },
  sectionTitle: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg, marginBottom: spacing.sm },
  itemRow: { flexDirection: "row", paddingVertical: 4 },
  itemQty: { color: colors.brand, fontWeight: "700", width: 28 },
  itemName: { flex: 1, color: colors.onSurface },
  itemOptions: { color: colors.onSurfaceTertiary, fontSize: font.size.sm, marginTop: 2 },
  itemPrice: { color: colors.onSurface, fontWeight: "600" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  sumLabel: { color: colors.onSurfaceSecondary },
  sumValue: { color: colors.onSurface, fontWeight: "600" },
  paymentText: { color: colors.onSurfaceSecondary, marginTop: spacing.sm },
  earnedText: { color: colors.success, fontWeight: "700", marginTop: spacing.sm },
  addrCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  addrLabel: { fontWeight: "700", color: colors.onSurface },
  addrText: { color: colors.onSurfaceSecondary, marginTop: 2, fontSize: font.size.sm },
  cancelBtn: { marginTop: spacing.lg, borderWidth: 1, borderColor: colors.error, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center" },
  cancelBtnText: { color: colors.error, fontWeight: "700" },
  confirmCard: { marginTop: spacing.lg, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.brandSecondary },
  confirmTitle: { fontSize: font.size.lg, fontWeight: "800", color: colors.onSurface },
  confirmHint: { color: colors.onSurfaceSecondary, marginTop: spacing.xs, fontSize: font.size.sm },
  confirmBtn: { flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.success, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.md },
  confirmBtnText: { color: "#fff", fontWeight: "800", fontSize: font.size.lg },
  ratingBox: { marginTop: spacing.xl, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.lg },
  ratingTitle: { textAlign: "center", fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
