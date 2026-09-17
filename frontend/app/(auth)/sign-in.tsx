import { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, registerThemedStyles } from "@/src/theme";
import { useTheme } from "@/src/theme-context";
import { useAuth } from "@/src/auth/AuthContext";

export default function SignIn() {
  const { signIn, signInCourier, registerCourier } = useAuth();
  const { isDark, toggle } = useTheme();
  const [mode, setMode] = useState<"geral" | "entregador">("geral");
  const [courierMode, setCourierMode] = useState<"entrar" | "cadastrar">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // courier fields
  const [cName, setCName] = useState("");
  const [cCpf, setCCpf] = useState("");
  const [cPass, setCPass] = useState("");
  const [cPlate, setCPlate] = useState("");
  const [cRenavam, setCRenavam] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (e: any) {
      setError(e.message || "Falha ao entrar");
    } finally {
      setLoading(false);
    }
  };

  const onCourierLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInCourier(cCpf.replace(/\D/g, ""), cPass);
    } catch (e: any) {
      setError(e.message || "Falha ao entrar");
    } finally {
      setLoading(false);
    }
  };

  const onCourierRegister = async () => {
    setError(null);
    const cpf = cCpf.replace(/\D/g, "");
    if (cName.trim().length < 2) { setError("Informe seu nome completo."); return; }
    if (cpf.length < 11) { setError("CPF inválido (11 dígitos)."); return; }
    if (!cPlate.trim()) { setError("Informe a placa da moto."); return; }
    if (!cRenavam.trim()) { setError("Informe o renavam da moto."); return; }
    setLoading(true);
    try {
      const u = await registerCourier({ name: cName.trim(), cpf, plate: cPlate.trim(), renavam: cRenavam.trim() });
      Alert.alert(
        "Cadastro concluído! 🎉",
        `Seu ID de entregador é ${u.courier_code}.\n\nGuarde este ID: o lojista vai usá-lo para te convidar. Sua senha é o seu CPF.`,
      );
    } catch (e: any) {
      setError(e.message || "Falha no cadastro");
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (kind: "cliente" | "lojista") => {
    if (kind === "cliente") {
      setEmail("cliente@zappyfood.com");
      setPassword("cliente123");
    } else {
      setEmail("lojista@zappyfood.com");
      setPassword("lojista123");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable
        testID="login-dark-toggle"
        style={styles.themeToggle}
        onPress={toggle}
        hitSlop={12}
      >
        <Ionicons name={isDark ? "sunny" : "moon"} size={20} color={colors.onSurfaceSecondary} />
      </Pressable>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBox}>
            <View style={styles.logo}>
              <Ionicons name="restaurant" size={40} color="#fff" />
            </View>
            <Text style={styles.title}>Pratô</Text>
            <Text style={styles.subtitle}>
              {mode === "entregador" ? "Área do entregador" : "Delivery direto do lojista para você"}
            </Text>
          </View>

          <View style={styles.modeTabs}>
            <Pressable
              testID="login-mode-geral"
              style={[styles.modeTab, mode === "geral" && styles.modeTabOn]}
              onPress={() => { setMode("geral"); setError(null); setEmail(""); setPassword(""); }}
            >
              <Text style={[styles.modeTabText, mode === "geral" && styles.modeTabTextOn]}>Cliente / Lojista</Text>
            </Pressable>
            <Pressable
              testID="login-mode-entregador"
              style={[styles.modeTab, mode === "entregador" && styles.modeTabOn]}
              onPress={() => { setMode("entregador"); setError(null); setEmail(""); setPassword(""); }}
            >
              <Text style={[styles.modeTabText, mode === "entregador" && styles.modeTabTextOn]}>Entregador</Text>
            </Pressable>
          </View>

          {mode === "entregador" ? (
            <View style={styles.card}>
              <View style={styles.subTabs}>
                <Pressable testID="courier-tab-entrar" style={[styles.subTab, courierMode === "entrar" && styles.subTabOn]} onPress={() => { setCourierMode("entrar"); setError(null); }}>
                  <Text style={[styles.subTabText, courierMode === "entrar" && styles.subTabTextOn]}>Entrar</Text>
                </Pressable>
                <Pressable testID="courier-tab-cadastrar" style={[styles.subTab, courierMode === "cadastrar" && styles.subTabOn]} onPress={() => { setCourierMode("cadastrar"); setError(null); }}>
                  <Text style={[styles.subTabText, courierMode === "cadastrar" && styles.subTabTextOn]}>Cadastrar</Text>
                </Pressable>
              </View>

              {courierMode === "entrar" ? (
                <>
                  <Text style={styles.label}>CPF</Text>
                  <TextInput testID="courier-login-cpf" style={styles.input} placeholder="Somente números" placeholderTextColor={colors.onSurfaceTertiary} keyboardType="number-pad" value={cCpf} onChangeText={setCCpf} />
                  <Text style={styles.label}>Senha (seu CPF)</Text>
                  <TextInput testID="courier-login-pass" style={styles.input} placeholder="Somente números" placeholderTextColor={colors.onSurfaceTertiary} keyboardType="number-pad" secureTextEntry value={cPass} onChangeText={setCPass} />
                  {error && <Text style={styles.error} testID="sign-in-error">{error}</Text>}
                  <Pressable testID="courier-login-submit" style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={onCourierLogin} disabled={loading}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Entrar como entregador</Text>}
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={styles.infoBox}>
                    <Text style={styles.infoText}>Cadastre-se para receber um ID único. A senha padrão é o seu CPF.</Text>
                  </View>
                  <Text style={styles.label}>Nome completo</Text>
                  <TextInput testID="courier-reg-name" style={styles.input} placeholder="Seu nome" placeholderTextColor={colors.onSurfaceTertiary} value={cName} onChangeText={setCName} />
                  <Text style={styles.label}>CPF</Text>
                  <TextInput testID="courier-reg-cpf" style={styles.input} placeholder="Somente números" placeholderTextColor={colors.onSurfaceTertiary} keyboardType="number-pad" value={cCpf} onChangeText={setCCpf} />
                  <Text style={styles.label}>Placa da moto</Text>
                  <TextInput testID="courier-reg-plate" style={styles.input} placeholder="ABC1D23" placeholderTextColor={colors.onSurfaceTertiary} autoCapitalize="characters" value={cPlate} onChangeText={setCPlate} />
                  <Text style={styles.label}>Renavam da moto</Text>
                  <TextInput testID="courier-reg-renavam" style={styles.input} placeholder="Somente números" placeholderTextColor={colors.onSurfaceTertiary} keyboardType="number-pad" value={cRenavam} onChangeText={setCRenavam} />
                  {error && <Text style={styles.error} testID="sign-in-error">{error}</Text>}
                  <Pressable testID="courier-reg-submit" style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={onCourierRegister} disabled={loading}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Cadastrar e gerar meu ID</Text>}
                  </Pressable>
                </>
              )}
            </View>
          ) : (
          <View style={styles.card}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              testID="sign-in-email"
              style={styles.input}
              placeholder="voce@email.com"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Text style={styles.label}>Senha</Text>
            <TextInput
              testID="sign-in-password"
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={colors.onSurfaceTertiary}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            {error && <Text style={styles.error} testID="sign-in-error">{error}</Text>}
            <Pressable
              testID="sign-in-submit"
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={onSubmit}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Entrar</Text>}
            </Pressable>

            <View style={styles.demoRow}>
              <Pressable testID="sign-in-demo-cliente" style={styles.demoBtn} onPress={() => fillDemo("cliente")}>
                <Text style={styles.demoText}>Usar demo Cliente</Text>
              </Pressable>
              <Pressable testID="sign-in-demo-lojista" style={styles.demoBtn} onPress={() => fillDemo("lojista")}>
                <Text style={styles.demoText}>Usar demo Lojista</Text>
              </Pressable>
            </View>

            <Link href="/(auth)/sign-up" asChild>
              <Pressable style={styles.linkRow} testID="sign-in-goto-signup">
                <Text style={styles.linkText}>
                  Não tem conta? <Text style={{ color: colors.brand, fontWeight: "700" }}>Cadastre-se</Text>
                </Text>
              </Pressable>
            </Link>
          </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1, padding: spacing.xl, justifyContent: "center" },
  brandBox: { alignItems: "center", marginBottom: spacing.xl },
  logo: {
    width: 72, height: 72, borderRadius: radius.lg,
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center",
    marginBottom: spacing.md,
  },
  logoText: { color: "#fff", fontSize: 40, fontWeight: "800" },
  themeToggle: {
    position: "absolute", top: spacing.md, right: spacing.lg, zIndex: 10,
    width: 40, height: 40, borderRadius: radius.pill,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
  },
  title: { fontSize: font.size.huge, fontWeight: "800", color: colors.onSurface },
  subtitle: { color: colors.onSurfaceSecondary, marginTop: spacing.xs, fontSize: font.size.base },
  card: { gap: spacing.sm },
  modeTabs: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, padding: 4 },
  modeTab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.md, borderRadius: radius.pill },
  modeTabOn: { backgroundColor: colors.brand },
  modeTabText: { color: colors.brand, fontWeight: "700", fontSize: font.size.sm },
  modeTabTextOn: { color: "#fff" },
  infoBox: { backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  infoText: { color: colors.onSurfaceSecondary, fontSize: font.size.sm },
  subTabs: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, padding: 4 },
  subTab: { flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: radius.pill },
  subTabOn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.brand },
  subTabText: { color: colors.onSurfaceSecondary, fontWeight: "700", fontSize: font.size.sm },
  subTabTextOn: { color: colors.brand },
  label: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, fontWeight: "600", marginTop: spacing.sm },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    fontSize: font.size.lg, color: colors.onSurface, backgroundColor: colors.surfaceSecondary,
  },
  button: {
    backgroundColor: colors.brand, borderRadius: radius.md,
    paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.lg,
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: font.size.lg },
  error: { color: colors.error, fontSize: font.size.sm, marginTop: spacing.sm },
  demoRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  demoBtn: {
    flex: 1, backgroundColor: colors.brandTertiary,
    borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center",
  },
  demoText: { color: colors.brand, fontWeight: "600", fontSize: font.size.sm },
  linkRow: { alignItems: "center", marginTop: spacing.lg },
  linkText: { color: colors.onSurfaceSecondary },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
