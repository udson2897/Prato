import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, brl, registerThemedStyles } from "@/src/theme";
import { useCart } from "@/src/store/cart";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";

const PAYMENTS = [
  { id: "PIX", label: "Pix", icon: "flash" as const },
  { id: "CARTAO", label: "Cartão na entrega", icon: "card" as const },
  { id: "DINHEIRO", label: "Dinheiro", icon: "cash" as const },
];

export default function Checkout() {
  const router = useRouter();
  const { refresh } = useAuth();
  const { lines, storeId, storeName, subtotal, incItem, decItem, removeItem, clear, count } = useCart();
  const [payment, setPayment] = useState<"PIX" | "CARTAO" | "DINHEIRO">("PIX");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [selectedAddr, setSelectedAddr] = useState<string | null>(null);
  const [points, setPoints] = useState(0);
  const [usePoints, setUsePoints] = useState(false);
  const [quote, setQuote] = useState<{ distance_km: number | null; fee: number; deliverable: boolean; reason: string | null; eta_min: number } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const loadData = useCallback(async () => {
    const [addr, loy] = await Promise.all([api.addresses(), api.loyalty()]);
    setAddresses(addr);
    setPoints(loy.points);
    const def = addr.find((a: any) => a.is_default) || addr[0];
    if (def && !selectedAddr) setSelectedAddr(def.id);
  }, [selectedAddr]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // Taxa de entrega automática por distância
  useEffect(() => {
    if (!storeId || !selectedAddr || count === 0) { setQuote(null); return; }
    let active = true;
    setQuoteLoading(true);
    api.deliveryQuote(storeId, selectedAddr, subtotal)
      .then((q) => { if (active) setQuote(q); })
      .catch(() => { if (active) setQuote(null); })
      .finally(() => { if (active) setQuoteLoading(false); });
    return () => { active = false; };
  }, [storeId, selectedAddr, subtotal, count]);

  const deliveryFee = quote?.fee ?? 0;
  const deliverable = quote?.deliverable ?? true;

  const baseTotal = subtotal + (count > 0 ? deliveryFee : 0);
  // Resgate em blocos de 100 pontos = R$ 2 de desconto. Limita ao total do pedido.
  const maxBlocks = Math.min(Math.floor(points / 100), Math.floor(baseTotal / 2));
  const redeemPoints = usePoints ? maxBlocks * 100 : 0;
  const pointsDiscount = usePoints ? maxBlocks * 2 : 0;
  const total = Math.max(0, baseTotal - pointsDiscount);

  const placeOrder = async () => {
    if (!storeId || lines.length === 0) return;
    if (!selectedAddr) { setError("Selecione um endereço de entrega"); return; }
    setError(null);
    setPlacing(true);
    try {
      const order = await api.createOrder({
        store_id: storeId,
        items: lines.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          variations: l.variations,
          addons: l.addons,
        })),
        address_id: selectedAddr,
        payment_method: payment,
        notes,
        redeem_points: redeemPoints,
      });
      clear();
      refresh();
      router.replace(`/(customer)/track/${order.id}`);
    } catch (e: any) {
      setError(e.message || "Falha ao criar pedido");
    } finally {
      setPlacing(false);
    }
  };

  if (count === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} testID="checkout-back">
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>Carrinho</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.empty}>
          <Ionicons name="basket-outline" size={64} color={colors.onSurfaceTertiary} />
          <Text style={styles.emptyTitle}>Seu carrinho está vazio</Text>
          <Text style={styles.emptySub}>Escolha uma loja e adicione produtos</Text>
          <Pressable style={styles.emptyBtn} onPress={() => router.replace("/(customer)")}>
            <Text style={styles.emptyBtnText}>Explorar lojas</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="checkout-back">
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 160 }}>
        <Text style={styles.storeLabel}>Loja: <Text style={{ fontWeight: "800" }}>{storeName}</Text></Text>

        <Text style={styles.section}>Itens</Text>
        {lines.map((l) => (
          <View key={l.key} style={styles.line} testID={`cart-line-${l.key}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineName}>{l.name}</Text>
              {l.options_label ? <Text style={styles.lineOptions}>{l.options_label}</Text> : null}
              <Text style={styles.linePrice}>{brl(l.unit_price)}</Text>
            </View>
            <View style={styles.qtyBox}>
              <Pressable onPress={() => decItem(l.key)} style={styles.qtyBtn} testID={`cart-dec-${l.key}`}>
                <Ionicons name="remove" size={16} color={colors.brand} />
              </Pressable>
              <Text style={styles.qtyText}>{l.quantity}</Text>
              <Pressable onPress={() => incItem(l.key)} style={styles.qtyBtn} testID={`cart-inc-${l.key}`}>
                <Ionicons name="add" size={16} color={colors.brand} />
              </Pressable>
            </View>
            <Pressable onPress={() => removeItem(l.key)} style={{ marginLeft: 8 }} testID={`cart-remove-${l.key}`}>
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </Pressable>
          </View>
        ))}

        <View style={styles.sectionRow}>
          <Text style={styles.section}>Endereço de entrega</Text>
          <Pressable testID="checkout-manage-address" onPress={() => router.push("/(customer)/addresses")}>
            <Text style={styles.manageLink}>Gerenciar</Text>
          </Pressable>
        </View>
        {addresses.length === 0 ? (
          <Pressable testID="checkout-add-address" style={styles.addAddr} onPress={() => router.push("/(customer)/addresses")}>
            <Ionicons name="add-circle-outline" size={20} color={colors.brand} />
            <Text style={styles.addAddrText}>Adicionar endereço</Text>
          </Pressable>
        ) : (
          addresses.map((a) => (
            <Pressable
              key={a.id}
              testID={`checkout-addr-${a.id}`}
              style={[styles.addressCard, selectedAddr === a.id && styles.addressCardActive]}
              onPress={() => setSelectedAddr(a.id)}
            >
              <Ionicons name="location" size={20} color={selectedAddr === a.id ? colors.brand : colors.onSurfaceSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.addressTitle}>{a.label}</Text>
                <Text style={styles.addressSub}>{a.street}, {a.number} - {a.city}/{a.state}</Text>
              </View>
              <View style={[styles.radio, selectedAddr === a.id && styles.radioActive]}>
                {selectedAddr === a.id && <View style={styles.radioDot} />}
              </View>
            </Pressable>
          ))
        )}

        <Text style={styles.section}>Forma de pagamento</Text>
        {PAYMENTS.map((p) => (
          <Pressable
            key={p.id}
            testID={`payment-${p.id}`}
            style={[styles.paymentRow, payment === p.id && styles.paymentRowActive]}
            onPress={() => setPayment(p.id as any)}
          >
            <Ionicons name={p.icon} size={20} color={payment === p.id ? colors.brand : colors.onSurfaceSecondary} />
            <Text style={[styles.paymentLabel, payment === p.id && { color: colors.brand, fontWeight: "700" }]}>{p.label}</Text>
            <View style={[styles.radio, payment === p.id && styles.radioActive]}>
              {payment === p.id && <View style={styles.radioDot} />}
            </View>
          </Pressable>
        ))}

        {points > 0 && (
          <View style={styles.loyaltyCard} testID="checkout-loyalty">
            <Ionicons name="ribbon" size={22} color={colors.brand} />
            <View style={{ flex: 1 }}>
              {maxBlocks > 0 ? (
                <>
                  <Text style={styles.loyaltyTitle}>Usar {maxBlocks * 100} pontos</Text>
                  <Text style={styles.loyaltySub}>Você tem {points} pontos • desconto de {brl(maxBlocks * 2)}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.loyaltyTitle}>Você tem {points} pontos</Text>
                  <Text style={styles.loyaltySub}>Junte 100 pontos para ganhar R$ 2 de desconto</Text>
                </>
              )}
            </View>
            {maxBlocks > 0 && (
              <Switch testID="checkout-use-points" value={usePoints} onValueChange={setUsePoints} trackColor={{ true: colors.brand }} />
            )}
          </View>
        )}

        <Text style={styles.section}>Observações</Text>
        <TextInput
          testID="checkout-notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Ex: sem cebola, ponto da carne..."
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.notesInput}
          multiline
        />

        <View style={styles.summary}>
          <SumRow label="Subtotal" value={brl(subtotal)} />
          <SumRow
            label={quote?.distance_km != null ? `Taxa de entrega (${quote.distance_km.toFixed(1)} km)` : "Taxa de entrega"}
            value={quoteLoading ? "calculando..." : brl(deliveryFee)}
          />
          {quote && quote.deliverable && (
            <Text style={styles.etaHint}>Entrega em ~{quote.eta_min} min • taxa calculada pela distância</Text>
          )}
          {redeemPoints > 0 && <SumRow label={`Desconto (${redeemPoints} pts)`} value={`- ${brl(pointsDiscount)}`} />}
          <View style={styles.divider} />
          <SumRow label="Total" value={brl(total)} bold />
        </View>

        {quote && !quote.deliverable && (
          <View style={styles.outOfRange} testID="checkout-out-of-range">
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.outOfRangeText}>{quote.reason || "Endereço fora da área de entrega desta loja"}</Text>
          </View>
        )}

        {error && <Text style={styles.error} testID="checkout-error">{error}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          testID="checkout-confirm"
          style={[styles.confirmBtn, (placing || !deliverable) && { opacity: 0.5 }]}
          disabled={placing || !deliverable}
          onPress={placeOrder}
        >
          {placing ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.confirmText}>
              {deliverable ? `Confirmar pedido • ${brl(total)}` : "Fora da área de entrega"}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function SumRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: bold ? colors.onSurface : colors.onSurfaceSecondary, fontWeight: bold ? "700" : "500", fontSize: bold ? 16 : 14 }}>{label}</Text>
      <Text style={{ color: bold ? colors.brand : colors.onSurface, fontWeight: bold ? "800" : "600", fontSize: bold ? 18 : 14 }}>{value}</Text>
    </View>
  );
}

const makeStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  storeLabel: { color: colors.onSurfaceSecondary },
  section: { marginTop: spacing.xl, marginBottom: spacing.sm, fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  manageLink: { color: colors.brand, fontWeight: "700", marginBottom: spacing.sm },
  line: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  lineName: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
  lineOptions: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, marginTop: 2 },
  linePrice: { color: colors.onSurfaceSecondary, marginTop: 2 },
  qtyBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: 4 },
  qtyBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  qtyText: { fontWeight: "700", color: colors.onSurface, minWidth: 20, textAlign: "center" },
  addressCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  addressCardActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  addressTitle: { fontWeight: "700", color: colors.onSurface },
  addressSub: { color: colors.onSurfaceSecondary, marginTop: 2, fontSize: font.size.sm },
  addAddr: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand, borderStyle: "dashed" },
  addAddrText: { color: colors.brand, fontWeight: "700" },
  paymentRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  paymentRowActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  paymentLabel: { flex: 1, color: colors.onSurface, fontSize: font.size.lg },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: colors.brand },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
  loyaltyCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brandSecondary },
  loyaltyTitle: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
  loyaltySub: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, marginTop: 2 },
  notesInput: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, minHeight: 80, textAlignVertical: "top", color: colors.onSurface },
  summary: { marginTop: spacing.xl, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  etaHint: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, marginTop: 2 },
  outOfRange: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.error + "12" },
  outOfRangeText: { flex: 1, color: colors.error, fontWeight: "600" },
  error: { color: colors.error, marginTop: spacing.md, textAlign: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
  confirmBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: "center" },
  confirmText: { color: "#fff", fontWeight: "800", fontSize: font.size.lg },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { fontSize: font.size.xl, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md },
  emptySub: { color: colors.onSurfaceSecondary, marginTop: spacing.sm },
  emptyBtn: { marginTop: spacing.xl, backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  emptyBtnText: { color: "#fff", fontWeight: "700" },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
