import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, View, ActivityIndicator, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/auth/AuthContext";
import { CartProvider } from "@/src/store/cart";
import { ThemeProvider, useTheme } from "@/src/theme-context";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function Gate() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const seg0 = segments[0] as string | undefined;
    if (seg0 === "entregador") return; // rota pública do entregador
    const inAuth = seg0 === "(auth)";
    const inCustomer = seg0 === "(customer)";
    const inLojista = seg0 === "(lojista)";
    const inEntregador = seg0 === "(entregador)";
    if (!user && !inAuth) {
      router.replace("/(auth)/sign-in");
      return;
    }
    if (user) {
      const role = user.active_role;
      const target = role === "lojista" ? "/(lojista)" : role === "entregador" ? "/(entregador)" : "/(customer)";
      if (inAuth || (!inCustomer && !inLojista && !inEntregador)) {
        router.replace(target as any);
        return;
      }
      // If role changed while inside wrong group, redirect
      if (role === "lojista" && !inLojista) router.replace("/(lojista)");
      else if (role === "entregador" && !inEntregador) router.replace("/(entregador)");
      else if (role !== "lojista" && role !== "entregador" && !inCustomer) router.replace("/(customer)");
    }
  }, [user, loading, segments, router]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface }]} testID="app-loading">
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <CartProvider>
              <Gate />
            </CartProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
