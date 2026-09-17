import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput,
  Modal, KeyboardAvoidingView, Platform, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { colors, spacing, radius, font, registerThemedStyles } from "@/src/theme";
import { api, lookupCep } from "@/src/lib/api";

const EMPTY = {
  label: "Casa", zip: "", street: "", number: "", complement: "",
  neighborhood: "", city: "", state: "", lat: null as number | null, lng: null as number | null,
};

export default function Addresses() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [cepLoading, setCepLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsBlocked, setGpsBlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const a = await api.addresses();
      setList(a);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onCepBlur = async () => {
    if (form.zip.replace(/\D/g, "").length !== 8) return;
    setCepLoading(true);
    setError(null);
    try {
      const r = await lookupCep(form.zip);
      setForm((f) => ({
        ...f, street: r.street, neighborhood: r.neighborhood, city: r.city, state: r.state, zip: r.zip,
        lat: r.lat ?? f.lat, lng: r.lng ?? f.lng,
      }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCepLoading(false);
    }
  };

  const useGps = async () => {
    setError(null);
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      if (!canAskAgain) setGpsBlocked(true);
      else setError("Permissão de localização negada");
      return;
    }
    setGpsBlocked(false);
    setGpsLoading(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [geo] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      setForm((f) => ({
        ...f,
        street: geo?.street || geo?.name || f.street,
        number: geo?.streetNumber || f.number,
        neighborhood: (geo as any)?.district || geo?.subregion || f.neighborhood,
        city: geo?.city || f.city,
        state: geo?.region || f.state,
        zip: (geo?.postalCode || f.zip).replace(/\D/g, ""),
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      }));
    } catch {
      setError("Não foi possível obter a localização");
    } finally {
      setGpsLoading(false);
    }
  };

  const save = async () => {
    if (!form.street || !form.number || !form.city) {
      setError("Preencha rua, número e cidade");
      return;
    }
    setSaving(true);
    try {
      let { lat, lng } = form;
      // Se não temos coordenadas, tentar geocodificar o endereço (para taxa por distância)
      if (lat == null || lng == null) {
        try {
          const full = `${form.street}, ${form.number}, ${form.city}, ${form.state}, Brasil`;
          const results = await Location.geocodeAsync(full);
          if (results && results[0]) { lat = results[0].latitude; lng = results[0].longitude; }
        } catch {}
      }
      await api.createAddress({ ...form, lat, lng, is_default: list.length === 0 });
      setModalOpen(false);
      setForm({ ...EMPTY });
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="addresses-back">
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Meus endereços</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : list.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="location-outline" size={56} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>Nenhum endereço salvo</Text>
          </View>
        ) : (
          list.map((a) => (
            <View key={a.id} style={styles.card} testID={`address-${a.id}`}>
              <Ionicons name="location" size={22} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Text style={styles.cardLabel}>{a.label}</Text>
                  {a.is_default && <View style={styles.defaultBadge}><Text style={styles.defaultText}>Principal</Text></View>}
                </View>
                <Text style={styles.cardAddr}>{a.street}, {a.number} {a.complement ? `- ${a.complement}` : ""}</Text>
                <Text style={styles.cardAddr}>{a.neighborhood} • {a.city}/{a.state}</Text>
                <View style={styles.cardActions}>
                  {!a.is_default && (
                    <Pressable testID={`address-default-${a.id}`} onPress={async () => { await api.setDefaultAddress(a.id); load(); }}>
                      <Text style={styles.actionLink}>Tornar principal</Text>
                    </Pressable>
                  )}
                  <Pressable testID={`address-delete-${a.id}`} onPress={async () => { await api.deleteAddress(a.id); load(); }}>
                    <Text style={[styles.actionLink, { color: colors.error }]}>Excluir</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))
        )}

        <Pressable testID="address-add" style={styles.addBtn} onPress={() => { setForm({ ...EMPTY }); setError(null); setModalOpen(true); }}>
          <Ionicons name="add" size={20} color={colors.brand} />
          <Text style={styles.addText}>Adicionar endereço</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo endereço</Text>
              <Pressable testID="address-modal-close" onPress={() => setModalOpen(false)}>
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>

            <Pressable testID="address-use-gps" style={styles.gpsBtn} onPress={useGps} disabled={gpsLoading}>
              {gpsLoading ? <ActivityIndicator color={colors.brand} /> : <Ionicons name="navigate" size={18} color={colors.brand} />}
              <Text style={styles.gpsText}>Usar minha localização (GPS)</Text>
            </Pressable>
            {gpsBlocked && (
              <Pressable style={styles.settingsBtn} onPress={() => Linking.openSettings()} testID="address-open-settings">
                <Text style={styles.settingsText}>Permissão bloqueada — Abrir Ajustes</Text>
              </Pressable>
            )}

            <ScrollView keyboardShouldPersistTaps="handled">
              <Field label="Nome (Casa, Trabalho...)" value={form.label} onChange={(t: string) => setForm({ ...form, label: t })} testID="address-label" />
              <View style={{ position: "relative" }}>
                <Field label="CEP" value={form.zip} onChange={(t: string) => setForm({ ...form, zip: t })} onBlur={onCepBlur} keyboardType="number-pad" testID="address-cep" />
                {cepLoading && <ActivityIndicator color={colors.brand} style={styles.cepSpinner} />}
              </View>
              <Field label="Rua" value={form.street} onChange={(t: string) => setForm({ ...form, street: t })} testID="address-street" />
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Field label="Número" value={form.number} onChange={(t: string) => setForm({ ...form, number: t })} keyboardType="number-pad" testID="address-number" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Complemento" value={form.complement} onChange={(t: string) => setForm({ ...form, complement: t })} testID="address-complement" />
                </View>
              </View>
              <Field label="Bairro" value={form.neighborhood} onChange={(t: string) => setForm({ ...form, neighborhood: t })} testID="address-neighborhood" />
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 2 }}>
                  <Field label="Cidade" value={form.city} onChange={(t: string) => setForm({ ...form, city: t })} testID="address-city" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="UF" value={form.state} onChange={(t: string) => setForm({ ...form, state: t })} testID="address-state" />
                </View>
              </View>
              {error && <Text style={styles.error}>{error}</Text>}
              <Pressable testID="address-save" style={styles.saveBtn} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Salvar endereço</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, onBlur, keyboardType, testID }: any) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput testID={testID} style={styles.input} value={value} onChangeText={onChange} onBlur={onBlur} keyboardType={keyboardType} placeholderTextColor={colors.onSurfaceTertiary} />
    </View>
  );
}

const makeStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  card: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.md },
  cardLabel: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
  defaultBadge: { backgroundColor: colors.brandTertiary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  defaultText: { color: colors.brand, fontSize: font.size.sm, fontWeight: "700" },
  cardAddr: { color: colors.onSurfaceSecondary, marginTop: 2 },
  cardActions: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm },
  actionLink: { color: colors.brand, fontWeight: "600" },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand, borderStyle: "dashed", marginTop: spacing.sm },
  addText: { color: colors.brand, fontWeight: "700", fontSize: font.size.lg },
  empty: { alignItems: "center", padding: spacing.xxl },
  emptyText: { color: colors.onSurfaceSecondary, marginTop: spacing.sm, fontSize: font.size.lg },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle: { fontSize: font.size.xl, fontWeight: "800", color: colors.onSurface },
  gpsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.md, paddingVertical: spacing.md, marginBottom: spacing.sm },
  gpsText: { color: colors.brand, fontWeight: "700" },
  settingsBtn: { alignItems: "center", paddingVertical: spacing.sm, marginBottom: spacing.sm },
  settingsText: { color: colors.error, fontWeight: "600" },
  label: { color: colors.onSurfaceSecondary, fontWeight: "600", marginBottom: spacing.xs, fontSize: font.size.sm },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.onSurface, backgroundColor: colors.surfaceSecondary, fontSize: font.size.lg },
  cepSpinner: { position: "absolute", right: spacing.md, top: 34 },
  error: { color: colors.error, marginBottom: spacing.md },
  saveBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: "center", marginBottom: spacing.xl },
  saveText: { color: "#fff", fontWeight: "800", fontSize: font.size.lg },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
