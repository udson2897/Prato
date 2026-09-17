import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, brl, registerThemedStyles } from "@/src/theme";
import { api } from "@/src/lib/api";

export default function Promotions() {
  const router = useRouter();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await api.myProducts();
      setProducts(p);
      const d: Record<string, string> = {};
      for (const item of p) d[item.id] = String(item.discount || 0);
      setDrafts(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveDiscount = async (p: any) => {
    setSavingId(p.id);
    try {
      const discount = parseFloat((drafts[p.id] || "0").replace(",", ".")) || 0;
      await api.updateProduct(p.id, {
        name: p.name, description: p.description || "", category: p.category,
        price: p.price, image_url: p.image_url || "", available: p.available,
        stock: p.stock ?? 100, discount,
        variation_groups: p.variation_groups || [], addons: p.addons || [],
      });
      await load();
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator color={colors.brand} style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="promotions-back">
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Cupons / Promoções</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>Escolha um produto e defina o valor do desconto (em R$). O cliente verá o preço promocional na loja.</Text>
          {products.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="pricetags-outline" size={56} color={colors.onSurfaceTertiary} />
              <Text style={styles.emptyText}>Cadastre produtos primeiro</Text>
            </View>
          ) : (
            products.map((p) => {
              const discount = parseFloat((drafts[p.id] || "0").replace(",", ".")) || 0;
              const eff = Math.max(0, p.price - discount);
              const active = (p.discount || 0) > 0;
              return (
                <View key={p.id} style={styles.card} testID={`promo-item-${p.id}`}>
                  <Image source={{ uri: p.image_url }} style={styles.thumb} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.pName}>{p.name}</Text>
                      {active && <View style={styles.activeTag}><Text style={styles.activeTagText}>ATIVO</Text></View>}
                    </View>
                    <Text style={styles.pPrice}>Preço: {brl(p.price)}{discount > 0 ? ` → ${brl(eff)}` : ""}</Text>
                    <View style={styles.editRow}>
                      <View style={styles.inputWrap}>
                        <Text style={styles.currency}>R$</Text>
                        <TextInput
                          testID={`promo-input-${p.id}`}
                          style={styles.input}
                          keyboardType="decimal-pad"
                          value={drafts[p.id]}
                          onChangeText={(t) => setDrafts((d) => ({ ...d, [p.id]: t }))}
                          placeholder="0,00"
                          placeholderTextColor={colors.onSurfaceTertiary}
                        />
                      </View>
                      <Pressable testID={`promo-save-${p.id}`} style={styles.saveBtn} onPress={() => saveDiscount(p)} disabled={savingId === p.id}>
                        {savingId === p.id ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Salvar</Text>}
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  intro: { color: colors.onSurfaceSecondary, marginBottom: spacing.lg },
  card: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.md },
  thumb: { width: 60, height: 60, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pName: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
  activeTag: { backgroundColor: colors.success, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  activeTagText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  pPrice: { color: colors.onSurfaceSecondary, marginTop: 2, fontSize: font.size.sm },
  editRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  inputWrap: { flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md },
  currency: { color: colors.onSurfaceSecondary, marginRight: 4 },
  input: { flex: 1, paddingVertical: spacing.sm, color: colors.onSurface, fontSize: font.size.lg },
  saveBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, alignItems: "center", justifyContent: "center", minWidth: 84 },
  saveText: { color: "#fff", fontWeight: "700" },
  empty: { alignItems: "center", padding: spacing.xxl },
  emptyText: { color: colors.onSurfaceSecondary, marginTop: spacing.sm, fontSize: font.size.lg },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
