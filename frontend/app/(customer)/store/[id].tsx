import { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, brl, registerThemedStyles } from "@/src/theme";
import { api } from "@/src/lib/api";
import { useCart } from "@/src/store/cart";

export default function StoreDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { addConfigured, storeId, storeName, count, subtotal, clear } = useCart();
  const [store, setStore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [warn, setWarn] = useState(false);
  const [customizing, setCustomizing] = useState<any | null>(null);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const s = await api.storeDetail(id as string);
        setStore(s);
        try {
          const f = await api.favoriteIds();
          setFavIds(new Set(f.ids));
        } catch {}
      } finally { setLoading(false); }
    })();
  }, [id]);

  const toggleFav = async (pid: string) => {
    setFavIds((prev) => {
      const n = new Set(prev);
      if (n.has(pid)) n.delete(pid); else n.add(pid);
      return n;
    });
    try {
      await api.toggleFavorite(pid);
    } catch {
      setFavIds((prev) => {
        const n = new Set(prev);
        if (n.has(pid)) n.delete(pid); else n.add(pid);
        return n;
      });
    }
  };

  if (loading || !store) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.brand} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  const productsByCategory: Record<string, any[]> = {};
  for (const p of store.products || []) {
    productsByCategory[p.category] = productsByCategory[p.category] || [];
    productsByCategory[p.category].push(p);
  }

  const startAdd = (p: any) => {
    if (storeId && storeId !== store.id) {
      setWarn(true);
      return;
    }
    const eff = Math.max(0, p.price - (p.discount || 0));
    const hasOptions = (p.variation_groups?.length || 0) > 0 || (p.addons?.length || 0) > 0;
    if (hasOptions) {
      setCustomizing({ ...p, price: eff, _original_price: p.price, _discount: p.discount || 0 });
    } else {
      addConfigured(store.id, store.fantasy_name, {
        product_id: p.id, name: p.name, base_price: eff, unit_price: eff,
        image_url: p.image_url,
        options_label: (p.discount || 0) > 0 ? `Promo -${brl(p.discount)}` : "",
        variations: {}, addons: [],
      });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View>
          <Image source={{ uri: store.banner_url }} style={styles.banner} contentFit="cover" transition={200} />
          <SafeAreaView edges={["top"]} style={styles.overlayBar}>
            <Pressable style={styles.backBtn} onPress={() => router.back()} testID="store-back">
              <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
            </Pressable>
          </SafeAreaView>
        </View>

        <View style={styles.storeHead}>
          <Text style={styles.title}>{store.fantasy_name}</Text>
          <Text style={styles.desc}>{store.description}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="star" size={14} color={colors.warning} />
            <Text style={styles.metaText}>{(store.rating || 0).toFixed(1)}</Text>
            <Text style={styles.metaText}>• {store.est_delivery_min} min</Text>
            <Text style={styles.metaText}>• Entrega {brl(store.delivery_fee)}</Text>
          </View>
        </View>

        {Object.entries(productsByCategory).map(([cat, items]) => (
          <View key={cat} style={styles.section}>
            <Text style={styles.sectionTitle}>{cat}</Text>
            {items.map((p) => {
              const hasOptions = (p.variation_groups?.length || 0) > 0 || (p.addons?.length || 0) > 0;
              const hasDiscount = (p.discount || 0) > 0;
              const eff = Math.max(0, p.price - (p.discount || 0));
              return (
                <Pressable key={p.id} testID={`product-${p.id}`} style={styles.productRow} onPress={() => startAdd(p)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.productName}>{p.name}</Text>
                    <Text style={styles.productDesc} numberOfLines={2}>{p.description}</Text>
                    {hasDiscount ? (
                      <View style={styles.priceRow}>
                        <Text style={styles.oldPrice}>{brl(p.price)}</Text>
                        <Text style={styles.productPrice}>{brl(eff)}</Text>
                        <View style={styles.promoTag}><Text style={styles.promoTagText}>PROMO</Text></View>
                      </View>
                    ) : (
                      <Text style={styles.productPrice}>{brl(p.price)}</Text>
                    )}
                    {hasOptions && <Text style={styles.customTag}>Personalizável</Text>}
                  </View>
                  <View style={styles.productImgWrap}>
                    <Image source={{ uri: p.image_url }} style={styles.productImg} contentFit="cover" />
                    <Pressable
                      testID={`fav-${p.id}`}
                      style={styles.favBtn}
                      onPress={() => toggleFav(p.id)}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={favIds.has(p.id) ? "heart" : "heart-outline"}
                        size={18}
                        color={favIds.has(p.id) ? colors.error : colors.onSurfaceSecondary}
                      />
                    </Pressable>
                    <View style={styles.plusBtn}>
                      <Ionicons name="add" size={18} color="#fff" />
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {warn && (
        <View style={styles.warnOverlay} testID="store-switch-modal">
          <View style={styles.warnBox}>
            <Text style={styles.warnTitle}>Nova loja?</Text>
            <Text style={styles.warnText}>
              Você já tem itens de {storeName} no carrinho. Ao continuar aqui, seu carrinho será esvaziado.
            </Text>
            <View style={styles.warnActions}>
              <Pressable style={styles.warnCancel} onPress={() => setWarn(false)}>
                <Text style={styles.warnCancelText}>Manter</Text>
              </Pressable>
              <Pressable style={styles.warnOk} onPress={() => { clear(); setWarn(false); }}>
                <Text style={styles.warnOkText}>Esvaziar carrinho</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {customizing && (
        <ProductCustomizer
          product={customizing}
          onClose={() => setCustomizing(null)}
          onAdd={(cfg) => {
            addConfigured(store.id, store.fantasy_name, cfg);
            setCustomizing(null);
          }}
        />
      )}

      {count > 0 && storeId === store.id && (
        <Pressable testID="store-cart-cta" style={styles.cartBanner} onPress={() => router.push("/(customer)/checkout")}>
          <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{count}</Text></View>
          <Text style={styles.cartText}>Ver carrinho</Text>
          <Text style={styles.cartTotal}>{brl(subtotal)}</Text>
        </Pressable>
      )}
    </View>
  );
}

function ProductCustomizer({ product, onClose, onAdd }: { product: any; onClose: () => void; onAdd: (cfg: any) => void }) {
  const groups: any[] = useMemo(() => product.variation_groups || [], [product]);
  const addons: any[] = useMemo(() => product.addons || [], [product]);
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const g of groups) if (g.required && g.options?.length) init[g.name] = g.options[0].name;
    return init;
  });
  const [chosenAddons, setChosenAddons] = useState<string[]>([]);

  const unitPrice = useMemo(() => {
    let price = product.price;
    for (const g of groups) {
      const sel = selected[g.name];
      const opt = g.options?.find((o: any) => o.name === sel);
      if (opt) price += opt.price_delta || 0;
    }
    for (const a of addons) if (chosenAddons.includes(a.name)) price += a.price;
    return price;
  }, [selected, chosenAddons, groups, addons, product.price]);

  const allRequiredMet = groups.every((g) => !g.required || selected[g.name]);

  const toggleAddon = (name: string) =>
    setChosenAddons((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));

  const buildLabel = () => {
    const parts: string[] = [];
    for (const g of groups) if (selected[g.name]) parts.push(`${g.name}: ${selected[g.name]}`);
    for (const a of chosenAddons) parts.push(`+ ${a}`);
    return parts.join(" • ");
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.customWrap}>
        <View style={styles.customSheet}>
          <View style={styles.customHeader}>
            <Text style={styles.customTitle}>{product.name}</Text>
            <Pressable testID="customizer-close" onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.onSurface} />
            </Pressable>
          </View>
          <ScrollView>
            {groups.map((g) => (
              <View key={g.name} style={styles.customGroup}>
                <View style={styles.groupHead}>
                  <Text style={styles.groupName}>{g.name}</Text>
                  {g.required && <Text style={styles.required}>Obrigatório</Text>}
                </View>
                {g.options?.map((o: any) => {
                  const on = selected[g.name] === o.name;
                  return (
                    <Pressable
                      key={o.name}
                      testID={`opt-${g.name}-${o.name}`}
                      style={styles.optionRow}
                      onPress={() => setSelected((p) => ({ ...p, [g.name]: o.name }))}
                    >
                      <Text style={styles.optionName}>{o.name}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                        {o.price_delta > 0 && <Text style={styles.optionPrice}>+ {brl(o.price_delta)}</Text>}
                        <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            {addons.length > 0 && (
              <View style={styles.customGroup}>
                <Text style={styles.groupName}>Adicionais</Text>
                {addons.map((a) => {
                  const on = chosenAddons.includes(a.name);
                  return (
                    <Pressable key={a.name} testID={`addon-${a.name}`} style={styles.optionRow} onPress={() => toggleAddon(a.name)}>
                      <Text style={styles.optionName}>{a.name}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                        <Text style={styles.optionPrice}>+ {brl(a.price)}</Text>
                        <View style={[styles.check, on && styles.checkOn]}>{on && <Ionicons name="checkmark" size={14} color="#fff" />}</View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
          <Pressable
            testID="customizer-add"
            style={[styles.addBtn, !allRequiredMet && { opacity: 0.5 }]}
            disabled={!allRequiredMet}
            onPress={() =>
              onAdd({
                product_id: product.id, name: product.name, base_price: product.price,
                unit_price: unitPrice, image_url: product.image_url,
                options_label: buildLabel(), variations: selected, addons: chosenAddons,
              })
            }
          >
            <Text style={styles.addText}>Adicionar • {brl(unitPrice)}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  banner: { width: "100%", height: 200, backgroundColor: colors.surfaceTertiary },
  overlayBar: { position: "absolute", left: 0, right: 0, top: 0, paddingHorizontal: spacing.md },
  backBtn: { marginTop: spacing.sm, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center" },
  storeHead: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  title: { fontSize: font.size.xxl, fontWeight: "800", color: colors.onSurface },
  desc: { color: colors.onSurfaceSecondary, marginTop: spacing.xs, fontSize: font.size.sm },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  metaText: { color: colors.onSurfaceSecondary, fontSize: font.size.sm },
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  sectionTitle: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.md },
  productRow: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  productName: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  productDesc: { color: colors.onSurfaceSecondary, marginTop: 2, fontSize: font.size.sm },
  productPrice: { color: colors.brand, fontWeight: "700", marginTop: spacing.sm, fontSize: font.size.lg },
  priceRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  oldPrice: { color: colors.onSurfaceTertiary, textDecorationLine: "line-through", fontSize: font.size.base },
  promoTag: { backgroundColor: colors.success, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  promoTagText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  customTag: { color: colors.onSurfaceTertiary, fontSize: font.size.sm, marginTop: 2 },
  productImgWrap: { position: "relative" },
  favBtn: { position: "absolute", right: -6, top: -8, width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3 },
  productImg: { width: 100, height: 100, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  plusBtn: { position: "absolute", right: -8, bottom: -8, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  cartBanner: {
    position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.lg,
    backgroundColor: colors.brand, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  cartBadge: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  cartBadgeText: { color: colors.brand, fontWeight: "800" },
  cartText: { color: "#fff", fontWeight: "700", fontSize: font.size.lg },
  cartTotal: { color: "#fff", fontWeight: "700", fontSize: font.size.lg },
  warnOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  warnBox: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, width: "100%" },
  warnTitle: { fontSize: font.size.xl, fontWeight: "800", color: colors.onSurface },
  warnText: { color: colors.onSurfaceSecondary, marginTop: spacing.sm },
  warnActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  warnCancel: { flex: 1, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  warnCancelText: { color: colors.onSurface, fontWeight: "700" },
  warnOk: { flex: 1, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.md, backgroundColor: colors.brand },
  warnOkText: { color: "#fff", fontWeight: "700" },
  // customizer
  customWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  customSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "85%" },
  customHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  customTitle: { fontSize: font.size.xl, fontWeight: "800", color: colors.onSurface, flex: 1 },
  customGroup: { marginBottom: spacing.lg },
  groupHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  groupName: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
  required: { color: colors.brand, fontSize: font.size.sm, fontWeight: "600" },
  optionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  optionName: { color: colors.onSurface, fontSize: font.size.lg },
  optionPrice: { color: colors.onSurfaceSecondary, fontSize: font.size.sm },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: colors.brand },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.brand },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkOn: { borderColor: colors.brand, backgroundColor: colors.brand },
  addBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.sm },
  addText: { color: "#fff", fontWeight: "800", fontSize: font.size.lg },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
