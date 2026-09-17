import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, brl, registerThemedStyles } from "@/src/theme";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";
import { useCart } from "@/src/store/cart";

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const { count, subtotal, storeId } = useCart();
  const [stores, setStores] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const [s, c, u] = await Promise.all([
        api.stores(undefined, activeCat || undefined),
        api.categories(),
        api.unreadCount().catch(() => ({ count: 0 })),
      ]);
      setStores(s);
      setCategories(c);
      setUnread(u.count);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCat]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Olá, {user?.name.split(" ")[0]}</Text>
          <Text style={styles.location}>
            <Ionicons name="location" size={14} color={colors.brand} /> Entregar em São Paulo
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            testID="home-open-notifications"
            style={styles.searchIcon}
            onPress={() => { setUnread(0); router.push("/(customer)/notifications"); }}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.onSurface} />
            {unread > 0 && (
              <View style={styles.notifBadge} testID="home-notif-badge">
                <Text style={styles.notifBadgeText}>{unread > 9 ? "9+" : unread}</Text>
              </View>
            )}
          </Pressable>
          <Pressable
            testID="home-open-search"
            style={styles.searchIcon}
            onPress={() => router.push("/(customer)/search")}
          >
            <Ionicons name="search" size={20} color={colors.onSurface} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        <View testID="home-categories">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            <Pressable
              testID="chip-all"
              style={[styles.chip, !activeCat && styles.chipActive]}
              onPress={() => setActiveCat(null)}
            >
              <Text style={[styles.chipText, !activeCat && styles.chipTextActive]}>Todos</Text>
            </Pressable>
            {categories.map((c) => (
              <Pressable
                key={c}
                testID={`chip-${c}`}
                style={[styles.chip, activeCat === c && styles.chipActive]}
                onPress={() => setActiveCat(activeCat === c ? null : c)}
              >
                <Text style={[styles.chipText, activeCat === c && styles.chipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <Text style={styles.sectionTitle}>Lojas próximas</Text>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
        ) : stores.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nenhuma loja encontrada</Text>
            <Text style={styles.emptySub}>Tente outra categoria</Text>
          </View>
        ) : (
          stores.map((s) => (
            <Pressable
              key={s.id}
              testID={`store-card-${s.id}`}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
              onPress={() => router.push(`/(customer)/store/${s.id}`)}
            >
              <Image source={{ uri: s.banner_url }} style={styles.cardImage} contentFit="cover" transition={200} />
              <View style={styles.cardBody}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{s.fantasy_name}</Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>{s.description}</Text>
                  <View style={styles.cardRow}>
                    <View style={styles.badge}>
                      <Ionicons name="star" size={12} color={colors.warning} />
                      <Text style={styles.badgeText}>{(s.rating || 0).toFixed(1)}</Text>
                    </View>
                    <Text style={styles.cardMeta}>• {s.est_delivery_min} min</Text>
                    <Text style={styles.cardMeta}>• {brl(s.delivery_fee)}</Text>
                  </View>
                </View>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      {count > 0 && storeId && (
        <Pressable
          testID="home-cart-cta"
          style={styles.cartBanner}
          onPress={() => router.push("/(customer)/checkout")}
        >
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{count}</Text>
          </View>
          <Text style={styles.cartText}>Ver carrinho</Text>
          <Text style={styles.cartTotal}>{brl(subtotal)}</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const makeStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  hello: { fontSize: font.size.xl, fontWeight: "700", color: colors.onSurface },
  location: { color: colors.onSurfaceSecondary, marginTop: 2, fontSize: font.size.sm },
  searchIcon: {
    width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  headerActions: { flexDirection: "row", gap: spacing.sm },
  notifBadge: {
    position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 4, borderWidth: 2, borderColor: colors.surface,
  },
  notifBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  scroll: { paddingBottom: 120 },
  chipsRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  chip: {
    flexShrink: 0, paddingHorizontal: spacing.lg, height: 36, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.onSurface, fontWeight: "600", fontSize: font.size.sm },
  chipTextActive: { color: "#fff" },
  sectionTitle: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface, marginHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.sm },
  card: {
    marginHorizontal: spacing.lg, marginBottom: spacing.lg,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: "hidden",
  },
  cardImage: { width: "100%", height: 140, backgroundColor: colors.surfaceTertiary },
  cardBody: { flexDirection: "row", padding: spacing.md, gap: spacing.md },
  cardTitle: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  cardMeta: { fontSize: font.size.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.surfaceSecondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm,
  },
  badgeText: { fontSize: font.size.sm, color: colors.onSurface, fontWeight: "600" },
  cartBanner: {
    position: "absolute", left: spacing.lg, right: spacing.lg, bottom: 80,
    backgroundColor: colors.brand, borderRadius: radius.md,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  cartBadge: {
    minWidth: 24, height: 24, borderRadius: 12, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center", paddingHorizontal: 6,
  },
  cartBadgeText: { color: colors.brand, fontWeight: "800" },
  cartText: { color: "#fff", fontWeight: "700", fontSize: font.size.lg },
  cartTotal: { color: "#fff", fontWeight: "700", fontSize: font.size.lg },
  empty: { padding: spacing.xxl, alignItems: "center" },
  emptyTitle: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  emptySub: { color: colors.onSurfaceSecondary, marginTop: 4 },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
