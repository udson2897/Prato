import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput,
  Modal, KeyboardAvoidingView, Platform, Switch,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, brl, registerThemedStyles } from "@/src/theme";
import { api } from "@/src/lib/api";
import ImageUpload from "@/src/components/ImageUpload";

type OptForm = { name: string; price_delta: string };
type GroupForm = { name: string; required: boolean; options: OptForm[] };
type AddonForm = { name: string; price: string };

type ProductForm = {
  id?: string;
  name: string;
  description: string;
  category: string;
  price: string;
  image_url: string;
  available: boolean;
  variation_groups: GroupForm[];
  addons: AddonForm[];
};

const EMPTY: ProductForm = {
  name: "", description: "", category: "Geral", price: "", image_url: "",
  available: true, variation_groups: [], addons: [],
};

export default function Products() {
  const [products, setProducts] = useState<any[]>([]);
  const [hasStore, setHasStore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const store = await api.myStore();
      if (!store) { setHasStore(false); setLoading(false); return; }
      setHasStore(true);
      const p = await api.myProducts();
      setProducts(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => { setForm(EMPTY); setModalOpen(true); };
  const openEdit = (p: any) => {
    setForm({
      id: p.id, name: p.name, description: p.description || "", category: p.category,
      price: String(p.price), image_url: p.image_url || "", available: p.available,
      variation_groups: (p.variation_groups || []).map((g: any) => ({
        name: g.name, required: !!g.required,
        options: (g.options || []).map((o: any) => ({ name: o.name, price_delta: String(o.price_delta ?? 0) })),
      })),
      addons: (p.addons || []).map((a: any) => ({ name: a.name, price: String(a.price ?? 0) })),
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name || !form.price) return;
    setSaving(true);
    try {
      const body = {
        name: form.name,
        description: form.description,
        category: form.category || "Geral",
        price: parseFloat(form.price.replace(",", ".")) || 0,
        image_url: form.image_url,
        available: form.available,
        stock: 100,
        variation_groups: form.variation_groups
          .filter((g) => g.name.trim())
          .map((g) => ({
            name: g.name.trim(),
            required: g.required,
            options: g.options.filter((o) => o.name.trim()).map((o) => ({
              name: o.name.trim(), price_delta: parseFloat(o.price_delta.replace(",", ".")) || 0,
            })),
          })),
        addons: form.addons
          .filter((a) => a.name.trim())
          .map((a) => ({ name: a.name.trim(), price: parseFloat(a.price.replace(",", ".")) || 0 })),
      };
      if (form.id) await api.updateProduct(form.id, body);
      else await api.createProduct(body);
      setModalOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => { await api.deleteProduct(id); load(); };

  // group/addon editors
  const addGroup = () => setForm((f) => ({ ...f, variation_groups: [...f.variation_groups, { name: "", required: true, options: [{ name: "", price_delta: "0" }] }] }));
  const removeGroup = (gi: number) => setForm((f) => ({ ...f, variation_groups: f.variation_groups.filter((_, i) => i !== gi) }));
  const updGroup = (gi: number, patch: Partial<GroupForm>) => setForm((f) => ({ ...f, variation_groups: f.variation_groups.map((g, i) => i === gi ? { ...g, ...patch } : g) }));
  const addOpt = (gi: number) => setForm((f) => ({ ...f, variation_groups: f.variation_groups.map((g, i) => i === gi ? { ...g, options: [...g.options, { name: "", price_delta: "0" }] } : g) }));
  const updOpt = (gi: number, oi: number, patch: Partial<OptForm>) => setForm((f) => ({ ...f, variation_groups: f.variation_groups.map((g, i) => i === gi ? { ...g, options: g.options.map((o, j) => j === oi ? { ...o, ...patch } : o) } : g) }));
  const removeOpt = (gi: number, oi: number) => setForm((f) => ({ ...f, variation_groups: f.variation_groups.map((g, i) => i === gi ? { ...g, options: g.options.filter((_, j) => j !== oi) } : g) }));
  const addAddon = () => setForm((f) => ({ ...f, addons: [...f.addons, { name: "", price: "0" }] }));
  const updAddon = (ai: number, patch: Partial<AddonForm>) => setForm((f) => ({ ...f, addons: f.addons.map((a, i) => i === ai ? { ...a, ...patch } : a) }));
  const removeAddon = (ai: number) => setForm((f) => ({ ...f, addons: f.addons.filter((_, i) => i !== ai) }));

  if (loading) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator color={colors.brand} style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  if (!hasStore) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}><Text style={styles.title}>Produtos</Text></View>
        <View style={styles.empty}><Text style={styles.emptyText}>Configure sua loja primeiro (aba Loja)</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}><Text style={styles.title}>Produtos</Text></View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        {products.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="fast-food-outline" size={56} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>Nenhum produto cadastrado</Text>
          </View>
        ) : (
          products.map((p) => {
            const opts = (p.variation_groups?.length || 0) + (p.addons?.length || 0);
            return (
              <View key={p.id} style={styles.row} testID={`product-item-${p.id}`}>
                <Image source={{ uri: p.image_url }} style={styles.thumb} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pName}>{p.name}</Text>
                  <Text style={styles.pCat}>{p.category}</Text>
                  <Text style={styles.pPrice}>{brl(p.price)}</Text>
                  {opts > 0 && <Text style={styles.pOpts}>{p.variation_groups?.length || 0} variações • {p.addons?.length || 0} adicionais</Text>}
                </View>
                <View style={{ gap: spacing.sm }}>
                  <Pressable testID={`product-edit-${p.id}`} onPress={() => openEdit(p)} style={styles.iconBtn}>
                    <Ionicons name="create-outline" size={20} color={colors.info} />
                  </Pressable>
                  <Pressable testID={`product-delete-${p.id}`} onPress={() => remove(p.id)} style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Pressable testID="product-add-fab" style={styles.fab} onPress={openNew}>
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{form.id ? "Editar produto" : "Novo produto"}</Text>
              <Pressable testID="product-modal-close" onPress={() => setModalOpen(false)}>
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Field label="Nome" value={form.name} onChange={(t: string) => setForm({ ...form, name: t })} testID="product-name" />
              <Field label="Descrição" value={form.description} onChange={(t: string) => setForm({ ...form, description: t })} testID="product-desc" />
              <Field label="Categoria" value={form.category} onChange={(t: string) => setForm({ ...form, category: t })} testID="product-category" />
              <Field label="Preço base (R$)" value={form.price} onChange={(t: string) => setForm({ ...form, price: t })} keyboardType="decimal-pad" testID="product-price" />
              <ImageUpload label="Imagem do produto" value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} aspect={[4, 3]} height={160} testID="product-image" />
              <View style={styles.switchRow}>
                <Text style={styles.label}>Disponível</Text>
                <Switch value={form.available} onValueChange={(v) => setForm({ ...form, available: v })} trackColor={{ true: colors.brand }} />
              </View>

              {/* Variations */}
              <View style={styles.blockHead}>
                <Text style={styles.blockTitle}>Variações (ex: tamanho, sabor)</Text>
                <Pressable testID="add-variation-group" onPress={addGroup} style={styles.addChip}>
                  <Ionicons name="add" size={16} color={colors.brand} />
                  <Text style={styles.addChipText}>Grupo</Text>
                </Pressable>
              </View>
              {form.variation_groups.map((g, gi) => (
                <View key={gi} style={styles.groupCard} testID={`variation-group-${gi}`}>
                  <View style={styles.groupTop}>
                    <TextInput
                      testID={`group-name-${gi}`}
                      style={styles.groupNameInput}
                      placeholder="Nome do grupo (ex: Tamanho)"
                      placeholderTextColor={colors.onSurfaceTertiary}
                      value={g.name}
                      onChangeText={(t) => updGroup(gi, { name: t })}
                    />
                    <Pressable onPress={() => removeGroup(gi)} testID={`remove-group-${gi}`}>
                      <Ionicons name="trash-outline" size={18} color={colors.error} />
                    </Pressable>
                  </View>
                  <View style={styles.reqRow}>
                    <Text style={styles.reqLabel}>Obrigatório escolher</Text>
                    <Switch value={g.required} onValueChange={(v) => updGroup(gi, { required: v })} trackColor={{ true: colors.brand }} />
                  </View>
                  {g.options.map((o, oi) => (
                    <View key={oi} style={styles.optRow}>
                      <TextInput
                        testID={`opt-name-${gi}-${oi}`}
                        style={styles.optName}
                        placeholder="Opção"
                        placeholderTextColor={colors.onSurfaceTertiary}
                        value={o.name}
                        onChangeText={(t) => updOpt(gi, oi, { name: t })}
                      />
                      <TextInput
                        testID={`opt-price-${gi}-${oi}`}
                        style={styles.optPrice}
                        placeholder="+R$"
                        placeholderTextColor={colors.onSurfaceTertiary}
                        keyboardType="decimal-pad"
                        value={o.price_delta}
                        onChangeText={(t) => updOpt(gi, oi, { price_delta: t })}
                      />
                      <Pressable onPress={() => removeOpt(gi, oi)} testID={`remove-opt-${gi}-${oi}`}>
                        <Ionicons name="close-circle" size={20} color={colors.onSurfaceTertiary} />
                      </Pressable>
                    </View>
                  ))}
                  <Pressable onPress={() => addOpt(gi)} style={styles.addOptBtn} testID={`add-opt-${gi}`}>
                    <Ionicons name="add" size={14} color={colors.brand} />
                    <Text style={styles.addOptText}>Adicionar opção</Text>
                  </Pressable>
                </View>
              ))}

              {/* Add-ons */}
              <View style={styles.blockHead}>
                <Text style={styles.blockTitle}>Adicionais (ingredientes extras)</Text>
                <Pressable testID="add-addon" onPress={addAddon} style={styles.addChip}>
                  <Ionicons name="add" size={16} color={colors.brand} />
                  <Text style={styles.addChipText}>Adicional</Text>
                </Pressable>
              </View>
              {form.addons.map((a, ai) => (
                <View key={ai} style={styles.optRow} testID={`addon-${ai}`}>
                  <TextInput
                    testID={`addon-name-${ai}`}
                    style={styles.optName}
                    placeholder="Ex: Bacon extra"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    value={a.name}
                    onChangeText={(t) => updAddon(ai, { name: t })}
                  />
                  <TextInput
                    testID={`addon-price-${ai}`}
                    style={styles.optPrice}
                    placeholder="R$"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    keyboardType="decimal-pad"
                    value={a.price}
                    onChangeText={(t) => updAddon(ai, { price: t })}
                  />
                  <Pressable onPress={() => removeAddon(ai)} testID={`remove-addon-${ai}`}>
                    <Ionicons name="close-circle" size={20} color={colors.onSurfaceTertiary} />
                  </Pressable>
                </View>
              ))}

              <Pressable testID="product-save" style={styles.saveBtn} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Salvar</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, keyboardType, testID }: any) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput testID={testID} style={styles.input} value={value} onChangeText={onChange} keyboardType={keyboardType} placeholderTextColor={colors.onSurfaceTertiary} />
    </View>
  );
}

const makeStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  title: { fontSize: font.size.xxl, fontWeight: "800", color: colors.onSurface },
  row: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.md, alignItems: "center" },
  thumb: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  pName: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
  pCat: { color: colors.onSurfaceSecondary, fontSize: font.size.sm },
  pPrice: { color: colors.brand, fontWeight: "700", marginTop: 2 },
  pOpts: { color: colors.onSurfaceTertiary, fontSize: font.size.sm, marginTop: 2 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", right: spacing.lg, bottom: 84, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  empty: { alignItems: "center", padding: spacing.xxl },
  emptyText: { color: colors.onSurfaceSecondary, marginTop: spacing.sm, fontSize: font.size.lg, textAlign: "center" },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  modalTitle: { fontSize: font.size.xl, fontWeight: "800", color: colors.onSurface },
  label: { color: colors.onSurfaceSecondary, fontWeight: "600", marginBottom: spacing.xs, fontSize: font.size.sm },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.onSurface, backgroundColor: colors.surfaceSecondary, fontSize: font.size.lg },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  blockHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.sm },
  blockTitle: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.base, flex: 1 },
  addChip: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  addChipText: { color: colors.brand, fontWeight: "700", fontSize: font.size.sm },
  groupCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, backgroundColor: colors.surfaceSecondary },
  groupTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  groupNameInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.onSurface, backgroundColor: colors.surface, fontWeight: "700" },
  reqRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: spacing.sm },
  reqLabel: { color: colors.onSurfaceSecondary, fontSize: font.size.sm },
  optRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  optName: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.onSurface, backgroundColor: colors.surface },
  optPrice: { width: 80, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.onSurface, backgroundColor: colors.surface, textAlign: "center" },
  addOptBtn: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: spacing.xs },
  addOptText: { color: colors.brand, fontWeight: "600", fontSize: font.size.sm },
  saveBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.md, marginBottom: spacing.xl },
  saveText: { color: "#fff", fontWeight: "800", fontSize: font.size.lg },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
