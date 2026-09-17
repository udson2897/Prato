import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, radius, font, registerThemedStyles } from "@/src/theme";
import { useTheme } from "@/src/theme-context";
import { useAuth } from "@/src/auth/AuthContext";

export default function Profile() {
  const { user, signOut } = useAuth();
  const { isDark, toggle } = useTheme();
  const router = useRouter();

  const points = user?.loyalty_points || 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        <View style={styles.userBox}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Fidelidade Pratô</Text>
          <Text style={styles.loyaltyText}>{points} pontos acumulados</Text>
          <Text style={styles.loyaltyHint}>Vale {`R$ ${(Math.floor(points / 100) * 2).toFixed(2).replace(".", ",")}`} de desconto. Cada R$ 10,00 gastos = 1 ponto • 100 pontos = R$ 2.</Text>
        </View>

        <View style={styles.rows}>
          <Row icon="location-outline" label="Meus endereços" onPress={() => router.push("/(customer)/addresses")} />
          <Row icon="receipt-outline" label="Meus pedidos" onPress={() => router.push("/(customer)/orders")} />
          <Row icon="heart-outline" label="Favoritos" onPress={() => router.push("/(customer)/favorites")} />
          <Row icon="help-circle-outline" label="Ajuda" />
        </View>

        <View style={styles.prefRow}>
          <View style={styles.prefLeft}>
            <Ionicons name={isDark ? "moon" : "moon-outline"} size={22} color={colors.brand} />
            <View>
              <Text style={styles.prefTitle}>Modo noturno</Text>
              <Text style={styles.prefSub}>Tema escuro para os olhos</Text>
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

        <Pressable testID="profile-logout" style={styles.logout} onPress={signOut}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.logoutText}>Sair da conta</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label, onPress }: { icon: any; label: string; onPress?: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress} testID={`profile-row-${label}`}>
      <Ionicons name={icon} size={22} color={colors.onSurfaceSecondary} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
    </Pressable>
  );
}

const makeStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  userBox: { alignItems: "center", padding: spacing.xl },
  avatar: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
  },
  avatarText: { color: "#fff", fontSize: 36, fontWeight: "800" },
  name: { fontSize: font.size.xl, fontWeight: "700", color: colors.onSurface },
  email: { color: colors.onSurfaceSecondary, marginTop: 2 },
  switchCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.brandTertiary, borderRadius: radius.md,
    padding: spacing.lg, marginBottom: spacing.lg, gap: spacing.md,
    borderWidth: 1, borderColor: colors.brandSecondary,
  },
  switchTitle: { fontWeight: "700", color: colors.brand, fontSize: font.size.lg },
  switchSub: { color: colors.onSurfaceSecondary, marginTop: 2, fontSize: font.size.sm },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.lg, marginBottom: spacing.lg,
  },
  sectionTitle: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
  loyaltyText: { fontSize: font.size.xl, color: colors.brand, fontWeight: "800", marginTop: spacing.xs },
  loyaltyHint: { color: colors.onSurfaceSecondary, marginTop: 4, fontSize: font.size.sm },
  rows: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  prefRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.lg },
  prefLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1, paddingRight: spacing.md },
  prefTitle: { color: colors.onSurface, fontWeight: "700", fontSize: font.size.lg },
  prefSub: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, marginTop: 2 },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  rowLabel: { flex: 1, color: colors.onSurface, fontSize: font.size.lg },
  logout: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    marginTop: spacing.xl, paddingVertical: spacing.md,
  },
  logoutText: { color: colors.error, fontWeight: "700", fontSize: font.size.lg },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
