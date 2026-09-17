import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { colors, spacing, radius, font, registerThemedStyles } from "@/src/theme";
import { useTheme } from "@/src/theme-context";
import { api, lookupCep } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";
import ImageUpload from "@/src/components/ImageUpload";

const STORE_STATUS = [
  { id: "ABERTA", label: "Aberta", color: colors.success },
  { id: "PAUSA", label: "Em pausa", color: colors.warning },
  { id: "FECHADA", label: "Fechada", color: colors.error },
  { id: "FERIAS", label: "Férias", color: colors.info },
];

export default function Settings() {
  const { signOut } = useAuth();
  const { isDark, toggle } = useTheme();
  const [store, setStore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fantasy_name: "", category: "", description: "", phone: "",
    cnpj: "", pix_key: "", address_text: "", cep: "", address_number: "", address_complement: "",
    delivery_fee: "", est_delivery_min: "", banner_url: "", logo_url: "",
    base_delivery_fee: "", price_per_km: "", max_radius_km: "", free_above: "",
    lat: null as number | null, lng: null as number | null,
  });
  const [gpsLoading, setGpsLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [pricingMode, setPricingMode] = useState<"per_km" | "bands">("per_km");
  const [bands, setBands] = useState<{ max_km: string; fee: string }[]>([]);

  const load = useCallback(async () => {
    try {
      const s = await api.myStore();
      setStore(s);
      if (s) {
        setForm({
          fantasy_name: s.fantasy_name || "",
          category: s.category || "",
          description: s.description || "",
          phone: s.phone || "",
          cnpj: s.cnpj || "",
          pix_key: s.pix_key || "",
          address_text: s.address_text || "",
          cep: s.cep || "",
          address_number: s.address_number || "",
          address_complement: s.address_complement || "",
          delivery_fee: String(s.delivery_fee ?? ""),
          est_delivery_min: String(s.est_delivery_min ?? ""),
          banner_url: s.banner_url || "",
          logo_url: s.logo_url || "",
          base_delivery_fee: String(s.base_delivery_fee ?? s.delivery_fee ?? ""),
          price_per_km: String(s.price_per_km ?? "1.5"),
          max_radius_km: String(s.max_radius_km ?? "8"),
          free_above: String(s.free_above ?? "0"),
          lat: s.lat ?? null,
          lng: s.lng ?? null,
        });
        setPricingMode(s.pricing_mode === "bands" ? "bands" : "per_km");
        const b = (s.delivery_bands || []).map((x: any) => ({ max_km: String(x.max_km), fee: String(x.fee) }));
        setBands(b.length ? b : [{ max_km: "2", fee: "5" }, { max_km: "5", fee: "8" }, { max_km: "8", fee: "12" }]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onCepChange = async (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    const masked = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    setForm((f) => ({ ...f, cep: masked }));
    setCepError(null);
    if (digits.length === 8) {
      setCepLoading(true);
      try {
        const d = await lookupCep(digits);
        const addr = [
          d.street,
          d.neighborhood,
          [d.city, d.state].filter(Boolean).join("/"),
        ].filter(Boolean).join(" - ");
        setForm((f) => ({
          ...f,
          address_text: addr || f.address_text,
          lat: d.lat ?? f.lat,
          lng: d.lng ?? f.lng,
        }));
      } catch (e: any) {
        setCepError(e?.message || "CEP não encontrado");
      } finally {
        setCepLoading(false);
      }
    }
  };

  const useStoreGps = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;
    setGpsLoading(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setForm((f) => ({ ...f, lat: pos.coords.latitude, lng: pos.coords.longitude }));
      // Best-effort: preenche o endereço em texto a partir das coordenadas
      try {
        const geo = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        const g = geo?.[0];
        if (g) {
          const parts = [
            [g.street, g.streetNumber].filter(Boolean).join(", "),
            g.district || g.subregion,
            [g.city, g.region].filter(Boolean).join("/"),
          ].filter(Boolean);
          const addr = parts.join(" - ");
          if (addr) setForm((f) => ({ ...f, address_text: f.address_text || addr }));
        }
      } catch {}
    } catch {} finally {
      setGpsLoading(false);
    }
  };

  const save = async () => {
    if (!form.fantasy_name || !form.category) return;
    setSaving(true);
    try {
      const base = parseFloat(form.base_delivery_fee.replace(",", ".")) || 0;
      const parsedBands = bands
        .map((b) => ({ max_km: parseFloat(b.max_km.replace(",", ".")) || 0, fee: parseFloat(b.fee.replace(",", ".")) || 0 }))
        .filter((b) => b.max_km > 0)
        .sort((a, b) => a.max_km - b.max_km);
      const saved = await api.saveStore({
        fantasy_name: form.fantasy_name,
        category: form.category,
        description: form.description,
        phone: form.phone,
        cnpj: form.cnpj,
        pix_key: form.pix_key,
        address_text: form.address_text,
        cep: form.cep,
        address_number: form.address_number,
        address_complement: form.address_complement,
        delivery_fee: base,
        est_delivery_min: parseInt(form.est_delivery_min) || 30,
        min_order: 0,
        banner_url: form.banner_url,
        logo_url: form.logo_url,
        pricing_mode: pricingMode,
        base_delivery_fee: base,
        price_per_km: parseFloat(form.price_per_km.replace(",", ".")) || 0,
        min_delivery_fee: base,
        max_radius_km: parseFloat(form.max_radius_km.replace(",", ".")) || 8,
        free_above: parseFloat(form.free_above.replace(",", ".")) || 0,
        delivery_bands: parsedBands,
        lat: form.lat,
        lng: form.lng,
      });
      setStore(saved);
    } finally {
      setSaving(false);
    }
  };

  const updBand = (i: number, patch: Partial<{ max_km: string; fee: string }>) =>
    setBands((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const addBand = () => setBands((prev) => [...prev, { max_km: "", fee: "" }]);
  const removeBand = (i: number) => setBands((prev) => prev.filter((_, j) => j !== i));

  const setStatus = async (status: string) => {
    await api.storeStatus(status);
    load();
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator color={colors.brand} style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Minha Loja</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          {store && (
            <>
              <Text style={styles.section}>Status da loja</Text>
              <View style={styles.statusRow}>
                {STORE_STATUS.map((s) => (
                  <Pressable
                    key={s.id}
                    testID={`store-status-${s.id}`}
                    style={[styles.statusChip, store.status === s.id && { backgroundColor: s.color, borderColor: s.color }]}
                    onPress={() => setStatus(s.id)}
                  >
                    <Text style={[styles.statusChipText, store.status === s.id && { color: "#fff" }]}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={styles.section}>Dados da loja</Text>
          <Field label="Nome fantasia" value={form.fantasy_name} onChange={(t: string) => setForm({ ...form, fantasy_name: t })} testID="store-name" />
          <Field label="Categoria" value={form.category} onChange={(t: string) => setForm({ ...form, category: t })} testID="store-category" />
          <Field label="CNPJ" value={form.cnpj} onChange={(t: string) => setForm({ ...form, cnpj: t })} testID="store-cnpj" keyboardType="number-pad" />
          <Field label="Chave Pix (para receber pagamentos)" value={form.pix_key} onChange={(t: string) => setForm({ ...form, pix_key: t })} testID="store-pix" />
          <Field label="Descrição" value={form.description} onChange={(t: string) => setForm({ ...form, description: t })} testID="store-desc" />
          <Field label="Telefone / WhatsApp" value={form.phone} onChange={(t: string) => setForm({ ...form, phone: t })} testID="store-phone" keyboardType="phone-pad" />
          <View style={{ marginBottom: spacing.md }}>
            <Text style={styles.label}>CEP</Text>
            <View style={styles.cepRow}>
              <TextInput
                testID="store-cep"
                style={[styles.input, { flex: 1 }]}
                value={form.cep}
                onChangeText={onCepChange}
                keyboardType="number-pad"
                placeholder="00000-000"
                placeholderTextColor={colors.onSurfaceTertiary}
                maxLength={9}
              />
              {cepLoading && <ActivityIndicator color={colors.brand} style={{ marginLeft: spacing.sm }} />}
            </View>
            {cepError ? <Text style={styles.cepError}>{cepError}</Text> : <Text style={styles.cepHint}>Digite o CEP para preencher o endereço automaticamente.</Text>}
          </View>
          <Field label="Endereço da loja" value={form.address_text} onChange={(t: string) => setForm({ ...form, address_text: t })} testID="store-address" />
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ width: 110 }}>
              <Field label="Número" value={form.address_number} onChange={(t: string) => setForm({ ...form, address_number: t })} testID="store-number" keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Complemento" value={form.address_complement} onChange={(t: string) => setForm({ ...form, address_complement: t })} testID="store-complement" />
            </View>
          </View>
          <Field label="Tempo estimado base (min)" value={form.est_delivery_min} onChange={(t: string) => setForm({ ...form, est_delivery_min: t })} testID="store-time" keyboardType="number-pad" />
          <ImageUpload label="Banner da loja" value={form.banner_url} onChange={(url) => setForm({ ...form, banner_url: url })} aspect={[16, 9]} height={150} testID="store-banner" />
          <ImageUpload label="Logo da loja" value={form.logo_url} onChange={(url) => setForm({ ...form, logo_url: url })} aspect={[1, 1]} height={110} round testID="store-logo" />

          <Text style={styles.section}>Entrega por distância</Text>
          <View style={styles.modeRow}>
            <Pressable
              testID="pricing-mode-per_km"
              style={[styles.modeChip, pricingMode === "per_km" && styles.modeChipActive]}
              onPress={() => setPricingMode("per_km")}
            >
              <Text style={[styles.modeText, pricingMode === "per_km" && styles.modeTextActive]}>Valor por km</Text>
            </Pressable>
            <Pressable
              testID="pricing-mode-bands"
              style={[styles.modeChip, pricingMode === "bands" && styles.modeChipActive]}
              onPress={() => setPricingMode("bands")}
            >
              <Text style={[styles.modeText, pricingMode === "bands" && styles.modeTextActive]}>Faixas de distância</Text>
            </Pressable>
          </View>

          <Pressable testID="store-use-gps" style={styles.gpsBtn} onPress={useStoreGps} disabled={gpsLoading}>
            {gpsLoading ? <ActivityIndicator color={colors.brand} /> : <Ionicons name="navigate" size={18} color={colors.brand} />}
            <Text style={styles.gpsText}>
              {form.lat != null ? "Localização definida ✓ (tocar para atualizar)" : "Definir localização da loja (GPS)"}
            </Text>
          </Pressable>

          {pricingMode === "per_km" ? (
            <>
              <Text style={styles.helpText}>Taxa = taxa base + (km × valor por km), respeitando o raio de atendimento.</Text>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Field label="Taxa base (R$)" value={form.base_delivery_fee} onChange={(t: string) => setForm({ ...form, base_delivery_fee: t })} testID="store-base-fee" keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Valor por km (R$)" value={form.price_per_km} onChange={(t: string) => setForm({ ...form, price_per_km: t })} testID="store-per-km" keyboardType="decimal-pad" />
                </View>
              </View>
              <Field label="Raio de atendimento (km)" value={form.max_radius_km} onChange={(t: string) => setForm({ ...form, max_radius_km: t })} testID="store-radius" keyboardType="decimal-pad" />
            </>
          ) : (
            <>
              <Text style={styles.helpText}>Defina o preço para cada faixa de distância. Pedidos além da maior faixa ficam fora da área.</Text>
              <View style={styles.bandHead}>
                <Text style={styles.bandCol}>Até (km)</Text>
                <Text style={styles.bandCol}>Taxa (R$)</Text>
                <View style={{ width: 28 }} />
              </View>
              {bands.map((b, i) => (
                <View key={i} style={styles.bandRow} testID={`band-${i}`}>
                  <TextInput
                    testID={`band-km-${i}`}
                    style={styles.bandInput}
                    keyboardType="decimal-pad"
                    value={b.max_km}
                    onChangeText={(t) => updBand(i, { max_km: t })}
                    placeholder="km"
                    placeholderTextColor={colors.onSurfaceTertiary}
                  />
                  <TextInput
                    testID={`band-fee-${i}`}
                    style={styles.bandInput}
                    keyboardType="decimal-pad"
                    value={b.fee}
                    onChangeText={(t) => updBand(i, { fee: t })}
                    placeholder="R$"
                    placeholderTextColor={colors.onSurfaceTertiary}
                  />
                  <Pressable onPress={() => removeBand(i)} testID={`band-remove-${i}`} style={{ width: 28, alignItems: "center" }}>
                    <Ionicons name="close-circle" size={22} color={colors.onSurfaceTertiary} />
                  </Pressable>
                </View>
              ))}
              <Pressable testID="band-add" style={styles.bandAdd} onPress={addBand}>
                <Ionicons name="add" size={16} color={colors.brand} />
                <Text style={styles.bandAddText}>Adicionar faixa</Text>
              </Pressable>
            </>
          )}
          <Field label="Frete grátis acima de (R$, 0 = desativado)" value={form.free_above} onChange={(t: string) => setForm({ ...form, free_above: t })} testID="store-free-above" keyboardType="decimal-pad" />


          <Pressable testID="store-save" style={styles.saveBtn} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{store ? "Salvar alterações" : "Criar loja"}</Text>}
          </Pressable>

          <Text style={styles.section}>Preferências</Text>
          <View style={styles.prefRow}>
            <View style={styles.prefLeft}>
              <Ionicons name={isDark ? "moon" : "moon-outline"} size={20} color={colors.brand} />
              <View>
                <Text style={styles.prefTitle}>Modo noturno</Text>
                <Text style={styles.prefSub}>Tema escuro para ambientes com pouca luz</Text>
              </View>
            </View>
            <Switch
              testID="dark-mode-switch"
              value={isDark}
              onValueChange={toggle}
              trackColor={{ false: colors.borderStrong, true: colors.brand }}
              thumbColor="#fff"
            />
          </View>

          <Pressable testID="settings-logout" style={styles.logout} onPress={signOut}>
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
            <Text style={styles.logoutText}>Sair da conta</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
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
  section: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg, marginTop: spacing.md, marginBottom: spacing.md },
  helpText: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, marginBottom: spacing.md },
  gpsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.md, paddingVertical: spacing.md, marginBottom: spacing.md },
  gpsText: { color: colors.brand, fontWeight: "700" },
  modeRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  modeChip: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: spacing.sm, alignItems: "center", backgroundColor: colors.surfaceSecondary },
  modeChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  modeText: { color: colors.onSurface, fontWeight: "600", fontSize: font.size.sm },
  modeTextActive: { color: "#fff" },
  bandHead: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xs },
  bandCol: { flex: 1, color: colors.onSurfaceSecondary, fontSize: font.size.sm, fontWeight: "600" },
  bandRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center", marginBottom: spacing.sm },
  bandInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.onSurface, backgroundColor: colors.surfaceSecondary, fontSize: font.size.lg },
  bandAdd: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: spacing.sm, marginBottom: spacing.sm },
  bandAddText: { color: colors.brand, fontWeight: "700" },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  statusChip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  statusChipText: { color: colors.onSurface, fontWeight: "600" },
  label: { color: colors.onSurfaceSecondary, fontWeight: "600", marginBottom: spacing.xs, fontSize: font.size.sm },
  cepRow: { flexDirection: "row", alignItems: "center" },
  cepHint: { color: colors.onSurfaceTertiary, fontSize: font.size.sm, marginTop: 4 },
  cepError: { color: colors.error, fontSize: font.size.sm, marginTop: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.onSurface, backgroundColor: colors.surfaceSecondary, fontSize: font.size.lg },
  saveBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.md },
  saveText: { color: "#fff", fontWeight: "800", fontSize: font.size.lg },
  prefRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  prefLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1, paddingRight: spacing.md },
  prefTitle: { color: colors.onSurface, fontWeight: "700", fontSize: font.size.lg },
  prefSub: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, marginTop: 2 },
  switchBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandTertiary },
  switchText: { color: colors.brand, fontWeight: "700", fontSize: font.size.lg },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md, paddingVertical: spacing.md },
  logoutText: { color: colors.error, fontWeight: "700", fontSize: font.size.lg },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
