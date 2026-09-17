import { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { colors, spacing, radius, font, registerThemedStyles } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { Role } from "@/src/lib/api";

export default function SignUp() {
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("cliente");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signUp(name, email.trim(), password, role, phone);
    } catch (e: any) {
      setError(e.message || "Falha ao cadastrar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Criar conta</Text>
          <Text style={styles.subtitle}>Comece agora no Pratô</Text>

          <Text style={styles.label}>Nome completo</Text>
          <TextInput testID="signup-name" style={styles.input} value={name} onChangeText={setName} />

          <Text style={styles.label}>E-mail</Text>
          <TextInput testID="signup-email" style={styles.input} value={email} onChangeText={setEmail}
            autoCapitalize="none" keyboardType="email-address" />

          <Text style={styles.label}>Telefone</Text>
          <TextInput testID="signup-phone" style={styles.input} value={phone} onChangeText={setPhone}
            keyboardType="phone-pad" />

          <Text style={styles.label}>Senha</Text>
          <TextInput testID="signup-password" style={styles.input} value={password} onChangeText={setPassword}
            secureTextEntry />

          <Text style={styles.label}>Sou</Text>
          <View style={styles.roleRow}>
            {(["cliente", "lojista"] as Role[]).map((r) => (
              <Pressable
                key={r}
                testID={`signup-role-${r}`}
                style={[styles.roleChip, role === r && styles.roleChipActive]}
                onPress={() => setRole(r)}
              >
                <Text style={[styles.roleText, role === r && styles.roleTextActive]}>
                  {r === "cliente" ? "Cliente" : "Lojista"}
                </Text>
              </Pressable>
            ))}
          </View>

          {error && <Text style={styles.error} testID="signup-error">{error}</Text>}

          <Pressable
            testID="signup-submit"
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
            onPress={onSubmit}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Criar conta</Text>}
          </Pressable>

          <Link href="/(auth)/sign-in" asChild>
            <Pressable style={styles.linkRow} testID="signup-goto-signin">
              <Text style={styles.linkText}>
                Já tem conta? <Text style={{ color: colors.brand, fontWeight: "700" }}>Entrar</Text>
              </Text>
            </Pressable>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  title: { fontSize: font.size.xxl, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md },
  subtitle: { color: colors.onSurfaceSecondary, marginBottom: spacing.lg },
  label: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, fontWeight: "600", marginTop: spacing.md },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginTop: spacing.xs,
    fontSize: font.size.lg, color: colors.onSurface, backgroundColor: colors.surfaceSecondary,
  },
  roleRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  roleChip: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill,
    paddingVertical: spacing.md, alignItems: "center", backgroundColor: colors.surfaceSecondary,
  },
  roleChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  roleText: { color: colors.onSurface, fontWeight: "600" },
  roleTextActive: { color: "#fff" },
  button: {
    backgroundColor: colors.brand, borderRadius: radius.md,
    paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.xl,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: font.size.lg },
  error: { color: colors.error, fontSize: font.size.sm, marginTop: spacing.sm },
  linkRow: { alignItems: "center", marginTop: spacing.lg },
  linkText: { color: colors.onSurfaceSecondary },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
