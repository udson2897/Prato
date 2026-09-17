import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert, Linking } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, registerThemedStyles } from "@/src/theme";
import { uploadImage } from "@/src/lib/api";

type Props = {
  label: string;
  value: string;
  onChange: (url: string) => void;
  aspect?: [number, number];
  height?: number;
  round?: boolean;
  testID?: string;
};

export default function ImageUpload({ label, value, onChange, aspect, height = 160, round, testID }: Props) {
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (perm.canAskAgain === false) {
        Alert.alert(
          "Permissão necessária",
          "Autorize o acesso às suas fotos nas configurações do dispositivo para enviar imagens.",
          [
            { text: "Cancelar", style: "cancel" },
            { text: "Abrir configurações", onPress: () => Linking.openSettings() },
          ],
        );
      } else {
        Alert.alert("Permissão necessária", "Precisamos acessar suas fotos para enviar a imagem.");
      }
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setBusy(true);
    try {
      const ext = (asset.uri.split(".").pop() || "jpg").split("?")[0];
      const name = asset.fileName || `photo.${ext}`;
      const type = asset.mimeType || "image/jpeg";
      const url = await uploadImage(asset.uri, name, type);
      onChange(url);
    } catch (e: any) {
      Alert.alert("Erro", e?.message || "Falha ao enviar a imagem. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      {value ? (
        <View style={styles.previewWrap}>
          <Image
            source={{ uri: value }}
            style={[styles.preview, { height }, round && { borderRadius: height / 2, width: height, alignSelf: "center" }]}
            contentFit="cover"
          />
          <View style={styles.actionsRow}>
            <Pressable testID={testID ? `${testID}-change` : undefined} style={styles.actionBtn} onPress={pick} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.brand} size="small" /> : (
                <>
                  <Ionicons name="image" size={16} color={colors.brand} />
                  <Text style={styles.actionText}>Trocar imagem</Text>
                </>
              )}
            </Pressable>
            <Pressable testID={testID ? `${testID}-remove` : undefined} style={styles.removeBtn} onPress={() => onChange("")} disabled={busy}>
              <Ionicons name="trash-outline" size={16} color={colors.error} />
              <Text style={styles.removeText}>Remover</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable testID={testID ? `${testID}-pick` : undefined} style={[styles.dropzone, { height }]} onPress={pick} disabled={busy}>
          {busy ? (
            <>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.dropHint}>Enviando...</Text>
            </>
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={30} color={colors.brand} />
              <Text style={styles.dropText}>Enviar imagem</Text>
              <Text style={styles.dropHint}>Escolha da galeria ou dos arquivos</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = () => StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { color: colors.onSurfaceSecondary, fontWeight: "600", marginBottom: spacing.xs, fontSize: font.size.sm },
  previewWrap: { gap: spacing.sm },
  preview: { width: "100%", borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  actionsRow: { flexDirection: "row", gap: spacing.sm },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand },
  actionText: { color: colors.brand, fontWeight: "700", fontSize: font.size.sm },
  removeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error },
  removeText: { color: colors.error, fontWeight: "700", fontSize: font.size.sm },
  dropzone: { alignItems: "center", justifyContent: "center", gap: 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand, borderStyle: "dashed", backgroundColor: colors.brandTertiary },
  dropText: { color: colors.brand, fontWeight: "800", fontSize: font.size.lg, marginTop: spacing.xs },
  dropHint: { color: colors.onSurfaceSecondary, fontSize: font.size.sm },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
