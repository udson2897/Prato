import { useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, brl, registerThemedStyles } from "@/src/theme";
import { api } from "@/src/lib/api";

export default function Search() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const s = await api.stores(q || undefined);
        setResults(s);
      } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.onSurfaceTertiary} />
          <TextInput
            testID="search-input"
            style={styles.searchInput}
            placeholder="Buscar lojas ou pratos"
            placeholderTextColor={colors.onSurfaceTertiary}
            value={q}
            onChangeText={setQ}
            autoFocus
          />
          {q.length > 0 && (
            <Pressable onPress={() => setQ("")} testID="search-clear">
              <Ionicons name="close-circle" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
          )}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        {loading && <ActivityIndicator color={colors.brand} />}
        {!loading && results.length === 0 && (
          <Text style={styles.emptyText}>Nenhum resultado</Text>
        )}
        {results.map((s) => (
          <Pressable
            key={s.id}
            testID={`search-result-${s.id}`}
            style={styles.row}
            onPress={() => router.push(`/(customer)/store/${s.id}`)}
          >
            <Image source={{ uri: s.logo_url }} style={styles.logo} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{s.fantasy_name}</Text>
              <Text style={styles.rowMeta}>{s.category} • {s.est_delivery_min} min • {brl(s.delivery_fee)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  searchInput: { flex: 1, fontSize: font.size.lg, color: colors.onSurface },
  emptyText: { textAlign: "center", color: colors.onSurfaceSecondary, marginTop: spacing.xl },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  logo: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  rowTitle: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  rowMeta: { fontSize: font.size.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
