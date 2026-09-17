import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, brl, STATUS_LABELS, STATUS_COLORS, registerThemedStyles } from "@/src/theme";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";

const NEXT: Record<string, { status: string; label: string } | null> = {
  AGUARDANDO_CONFIRMACAO: { status: "ACEITO", label: "Aceitar" },
  ACEITO: { status: "EM_PREPARO", label: "Iniciar preparo" },
  EM_PREPARO: { status: "SAIU_PARA_ENTREGA", label: "Saiu para entrega" },
  SAIU_PARA_ENTREGA: { status: "FINALIZADO", label: "Finalizar" },
  FINALIZADO: null, CANCELADO: null,
};

export default function LojistaOrderDetail() {
  const { id, assign } = useLocalSearchParams<{ id: string; assign?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [couriers, setCouriers] = useState<any[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const courierY = useRef(0);
  const didScroll = useRef(false);

  const acceptedCouriers = couriers.filter((c) => c.status === "accepted");

  const assignTo = async (courierId: string) => {
    setAssigning(true);
    try {
      await api.assignCourier(order.id, courierId);
      await load();
      Alert.alert("Oferta enviada ✅", "O entregador foi notificado e precisa aceitar a entrega.");
    } catch (e: any) {
      Alert.alert("Não foi possível atribuir", e?.message || "Tente novamente.");
    } finally {
      setAssigning(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const [o, m, c] = await Promise.all([api.order(id as string), api.listChat(id as string), api.couriers().catch(() => [])]);
      setOrder(o);
      setMessages(m);
      setCouriers(c);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (assign === "1" && order && !didScroll.current) {
      didScroll.current = true;
      setHighlight(true);
      setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, courierY.current - 12), animated: true }), 500);
      setTimeout(() => setHighlight(false), 2500);
    }
  }, [assign, order]);

  const advance = async () => {
    const n = NEXT[order.status];
    if (!n) return;
    await api.updateOrderStatus(order.id, n.status);
    load();
  };

  const send = async () => {
    if (!text.trim()) return;
    const t = text.trim();
    setText("");
    await api.sendChat(id as string, t);
    load();
  };

  if (loading || !order) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator color={colors.brand} style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  const next = NEXT[order.status];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="lojista-order-back">
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Pedido</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={80}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 20 }}>
          <View style={styles.topRow}>
            <Text style={styles.customer}>{order.customer_name}</Text>
            <View style={[styles.pill, { backgroundColor: (STATUS_COLORS[order.status] || colors.info) + "22" }]}>
              <Text style={[styles.pillText, { color: STATUS_COLORS[order.status] || colors.info }]}>{STATUS_LABELS[order.status]}</Text>
            </View>
          </View>

          <View style={styles.card}>
            {order.items.map((it: any, i: number) => (
              <View key={i} style={styles.itemRow}>
                <Text style={styles.itemQty}>{it.quantity}×</Text>
                <Text style={styles.itemName}>{it.name}</Text>
                <Text style={styles.itemPrice}>{brl(it.line_total)}</Text>
              </View>
            ))}
            <View style={styles.divider} />
            <Row label="Subtotal" value={brl(order.subtotal)} />
            <Row label="Entrega" value={brl(order.delivery_fee)} />
            <Row label="Total" value={brl(order.total)} bold />
            <Text style={styles.payment}>Pagamento: {order.payment_method}</Text>
            {order.notes ? <Text style={styles.notes}>Obs: {order.notes}</Text> : null}
          </View>

          <Text style={styles.chatTitle}>Entregador</Text>
          <View
            style={[styles.courierBox, highlight && styles.courierBoxHi]}
            onLayout={(e) => { courierY.current = e.nativeEvent.layout.y; }}
          >
            {order.courier ? (
              <View style={styles.courierStatusOk}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={styles.courierAssigned}>Aceito: {order.courier.name} • {order.courier.plate}{order.courier.courier_code ? ` (${order.courier.courier_code})` : ""}</Text>
              </View>
            ) : order.courier_offer?.status === "pending" ? (
              <View style={styles.courierStatusWait}>
                <Ionicons name="hourglass-outline" size={18} color={colors.warning} />
                <Text style={styles.courierWait}>Oferta enviada para {order.courier_offer.courier_name} — aguardando aceite</Text>
              </View>
            ) : order.courier_refused ? (
              <View style={styles.courierStatusWait}>
                <Ionicons name="close-circle" size={18} color={colors.error} />
                <Text style={styles.courierRefused}>{order.courier_refused.courier_name} recusou — escolha outro entregador</Text>
              </View>
            ) : (
              <Text style={styles.courierHint}>Escolha um entregador para este pedido:</Text>
            )}
            {acceptedCouriers.length === 0 ? (
              <Text style={styles.courierHint}>
                Nenhum entregador disponível. Convide pelo ID em Painel → Entregadores e aguarde ele aceitar.
              </Text>
            ) : (
              <View style={styles.courierChips}>
                {acceptedCouriers.map((c) => {
                  const on = (order.courier?.id || order.courier_offer?.courier_id) === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      testID={`assign-courier-${c.id}`}
                      style={[styles.courierChip, on && styles.courierChipOn]}
                      onPress={() => assignTo(c.id)}
                      disabled={assigning}
                    >
                      <Text style={[styles.courierChipText, on && { color: "#fff" }]}>{c.name}</Text>
                      <Text style={[styles.courierChipCode, on && { color: "#fff" }]}>{c.courier_code}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <Text style={styles.chatTitle}>Chat com cliente</Text>
          <View style={styles.chatBox}>
            {messages.length === 0 && <Text style={styles.chatEmpty}>Nenhuma mensagem</Text>}
            {messages.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <View key={m.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  {!mine && <Text style={styles.sender}>{m.sender_name}</Text>}
                  <Text style={[styles.msgText, mine && { color: "#fff" }]}>{m.text}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>

        {next && (
          <View style={styles.actionBar}>
            <Pressable testID="lojista-order-advance" style={styles.advanceBtn} onPress={advance}>
              <Text style={styles.advanceText}>{next.label}</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.inputBar}>
          <TextInput
            testID="lojista-chat-input"
            value={text}
            onChangeText={setText}
            placeholder="Responder cliente..."
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.input}
          />
          <Pressable testID="lojista-chat-send" style={styles.sendBtn} onPress={send}>
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
      <Text style={{ color: colors.onSurfaceSecondary, fontWeight: bold ? "800" : "500", fontSize: bold ? 16 : 14 }}>{label}</Text>
      <Text style={{ color: bold ? colors.brand : colors.onSurface, fontWeight: bold ? "800" : "600", fontSize: bold ? 18 : 14 }}>{value}</Text>
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
  headerTitle: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  customer: { fontSize: font.size.xl, fontWeight: "800", color: colors.onSurface },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  pillText: { fontWeight: "700", fontSize: font.size.sm },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg },
  itemRow: { flexDirection: "row", paddingVertical: 4 },
  itemQty: { color: colors.brand, fontWeight: "700", width: 28 },
  itemName: { flex: 1, color: colors.onSurface },
  itemPrice: { color: colors.onSurface, fontWeight: "600" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  payment: { color: colors.onSurfaceSecondary, marginTop: spacing.sm },
  notes: { color: colors.onSurfaceSecondary, marginTop: 2, fontStyle: "italic" },
  chatTitle: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  courierBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md },
  courierBoxHi: { borderWidth: 2, borderColor: colors.brand },
  courierStatusOk: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  courierStatusWait: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  courierAssigned: { color: colors.success, fontWeight: "700", flex: 1 },
  courierWait: { color: colors.warning, fontWeight: "700", flex: 1 },
  courierRefused: { color: colors.error, fontWeight: "700", flex: 1 },
  courierHint: { color: colors.onSurfaceSecondary, fontSize: font.size.sm },
  courierChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  courierChip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center" },
  courierChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  courierChipText: { color: colors.onSurface, fontWeight: "700" },
  courierChipCode: { color: colors.onSurfaceSecondary, fontWeight: "600", fontSize: font.size.sm, marginTop: 2 },
  chatBox: { gap: spacing.sm },
  chatEmpty: { color: colors.onSurfaceTertiary },
  bubble: { maxWidth: "80%", padding: spacing.md, borderRadius: radius.md },
  mine: { alignSelf: "flex-end", backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  theirs: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderBottomLeftRadius: 4 },
  sender: { color: colors.onSurfaceTertiary, fontSize: font.size.sm, fontWeight: "600" },
  msgText: { color: colors.onSurface, fontSize: font.size.lg },
  actionBar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  advanceBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center" },
  advanceText: { color: "#fff", fontWeight: "800", fontSize: font.size.lg },
  inputBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  input: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, color: colors.onSurface },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
