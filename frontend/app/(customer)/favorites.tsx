import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, brl, registerThemedStyles } from "@/src/theme";
import { api } from "@/src/lib/api";

export default function Favorites() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.favorites();
      setItems(data);
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const removeFav = async (pid: string) => {
    setItems((prev) => prev.filter((p) => p.id !== pid));
    try { await api.toggleFavorite(pid); } catch { load(); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} testID="fav-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Favoritos</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 60 }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="heart-outline" size={56} color={colors.onSurfaceTertiary} />
          <Text style={styles.emptyTitle}>Nenhum favorito ainda</Text>
          <Text style={styles.emptyText}>Toque no coração de um produto para salvá-lo aqui.</Text>
          <Pressable testID="fav-explore" style={styles.exploreBtn} onPress={() => router.push("/(customer)")}>
            <Text style={styles.exploreText}>Explorar lojas</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        >
          {items.map((p) => {
            const eff = Math.max(0, p.price - (p.discount || 0));
            return (
              <Pressable
                key={p.id}
                testID={`fav-item-${p.id}`}
                style={styles.card}
                onPress={() => router.push(`/(customer)/store/${p.store_id}`)}
              >
                <Image source={{ uri: p.image_url }} style={styles.img} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.storeName} numberOfLines={1}>{p.store_name}</Text>
                  <Text style={styles.price}>{brl(eff)}</Text>
                </View>
                <Pressable testID={`fav-remove-${p.id}`} style={styles.heart} onPress={() => removeFav(p.id)} hitSlop={8}>
                  <Ionicons name="heart" size={22} color={colors.error} />
                </Pressable>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const makeStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  title: { fontSize: font.size.xxl, fontWeight: "800", color: colors.onSurface },
  empty: { alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, marginTop: 80, gap: spacing.sm },
  emptyTitle: { fontSize: font.size.xl, fontWeight: "700", color: colors.onSurface, marginTop: spacing.sm },
  emptyText: { color: colors.onSurfaceSecondary, textAlign: "center", fontSize: font.size.base },
  exploreBtn: { marginTop: spacing.lg, backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  exploreText: { color: "#fff", fontWeight: "700", fontSize: font.size.lg },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  img: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  name: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  storeName: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, marginTop: 2 },
  price: { color: colors.brand, fontWeight: "700", marginTop: spacing.xs, fontSize: font.size.lg },
  heart: { padding: spacing.sm },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
