import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator,
  Platform, Linking, RefreshControl, Modal, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Clipboard from "expo-clipboard";
import { useAudioPlayer } from "expo-audio";
import { colors, spacing, radius, font, brl, STATUS_LABELS, STATUS_COLORS, registerThemedStyles } from "@/src/theme";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";
import LiveMap from "@/src/components/LiveMap";

const beepSound = require("../../assets/sounds/beep.wav");
const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const API = `${BASE}/api`;

const ACTIVE = ["AGUARDANDO_CONFIRMACAO", "ACEITO", "EM_PREPARO", "SAIU_PARA_ENTREGA"];

export default function EntregadorHome() {
  const { user, signOut } = useAuth();
  const [mode, setMode] = useState<"entregas" | "saldo">("entregas");
  const [orders, setOrders] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [code, setCode] = useState("");
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routeStarted, setRouteStarted] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [gpsInfo, setGpsInfo] = useState("");
  const [balance, setBalance] = useState<any>(null);
  const [balLoading, setBalLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [invites, setInvites] = useState<any[]>([]);
  const [activeOffer, setActiveOffer] = useState<any>(null);
  const seenOffers = useRef<Set<string>>(new Set());
  const player = useAudioPlayer(beepSound);
  const webWatchId = useRef<number | null>(null);
  const nativeWatch = useRef<Location.LocationSubscription | null>(null);

  const playBeep = useCallback(() => {
    try { player.seekTo(0); player.play(); } catch {}
  }, [player]);

  const pollOffersInvites = useCallback(async () => {
    try {
      const [ofs, invs] = await Promise.all([
        api.courierOffers().catch(() => []),
        api.courierInvites().catch(() => []),
      ]);
      setInvites(invs);
      const newOne = ofs.find((o: any) => !seenOffers.current.has(o.id));
      ofs.forEach((o: any) => seenOffers.current.add(o.id));
      if (newOne) {
        playBeep();
        setActiveOffer((cur: any) => cur || newOne);
      }
    } catch {}
  }, [playBeep]);

  useFocusEffect(useCallback(() => {
    pollOffersInvites();
    const t = setInterval(pollOffersInvites, 8000);
    return () => clearInterval(t);
  }, [pollOffersInvites]));

  const respondOffer = async (accept: boolean) => {
    if (!activeOffer) return;
    try {
      await api.respondOffer(activeOffer.id, accept);
      seenOffers.current.delete(activeOffer.id);
    } catch (e: any) {
      Alert.alert("Erro", e?.message || "Falha ao responder.");
    }
    setActiveOffer(null);
    pollOffersInvites();
    loadOrders();
    setBalance(null);
  };

  const respondInvite = async (link: any, accept: boolean) => {
    try { await api.respondInvite(link.id, accept); } catch {}
    pollOffersInvites();
  };

  const copyId = async () => {
    if (!user?.courier_code) return;
    await Clipboard.setStringAsync(user.courier_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const loadOrders = useCallback(async () => {
    try { setOrders(await api.courierMyOrders()); } finally { setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { loadOrders(); }, [loadOrders]));

  const loadBalance = useCallback(async () => {
    setBalLoading(true);
    try { setBalance(await api.courierMyEarnings()); } finally { setBalLoading(false); }
  }, []);

  useEffect(() => { if (mode === "saldo" && !balance) loadBalance(); }, [mode, balance, loadBalance]);

  const openOrder = async (c: string) => {
    const cc = (c || "").trim().toUpperCase();
    if (!cc) { setError("Informe o número do pedido."); return; }
    setError(null); setLoading(true); setOrder(null); setRouteStarted(false); setFinished(false);
    try {
      const d = await api.courierMyOrder(cc);
      setOrder(d);
      if (d.status === "FINALIZADO") setFinished(true);
    } catch (e: any) {
      setError(e?.message || "Pedido não encontrado ou não atribuído a você.");
    } finally {
      setLoading(false);
    }
  };

  const postLocation = (lat: number, lng: number) => {
    setGpsInfo(`Transmitindo: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    fetch(`${API}/courier/order/${order.code}/location`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    }).catch(() => {});
  };

  const buildDest = () => {
    const a = order?.address;
    if (a?.lat != null && a?.lng != null) return { coords: `${a.lat},${a.lng}` };
    const q = [a?.street, a?.number, a?.neighborhood, a?.city, a?.state].filter(Boolean).join(", ");
    return { query: q };
  };

  const openMaps = (app: "google" | "waze") => {
    const d = buildDest();
    let url: string;
    if (app === "waze") {
      url = d.coords ? `https://waze.com/ul?ll=${d.coords}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(d.query || "")}`;
    } else {
      const dest = d.coords || encodeURIComponent(d.query || "");
      url = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
    }
    setNavOpen(false);
    Linking.openURL(url).catch(() => setError("Não foi possível abrir o app de navegação."));
  };

  const startRoute = async () => {
    const addr = order?.address;
    if (!addr || (!addr.street && addr.lat == null)) { setError("Este pedido não tem endereço do cliente."); return; }
    setRouteStarted(true);
    setNavOpen(true);
    if (Platform.OS === "web") {
      if (navigator?.geolocation) {
        webWatchId.current = navigator.geolocation.watchPosition(
          (pos) => postLocation(pos.coords.latitude, pos.coords.longitude),
          () => setGpsInfo("GPS negado ou indisponível"),
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
        ) as unknown as number;
      } else { setGpsInfo("Navegador sem suporte a GPS"); }
    } else {
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setGpsInfo("Permissão de GPS negada");
        if (!canAskAgain) Linking.openSettings();
        return;
      }
      nativeWatch.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 2000 },
        (pos) => postLocation(pos.coords.latitude, pos.coords.longitude),
      );
    }
  };

  const stopWatch = () => {
    if (webWatchId.current != null && navigator?.geolocation) {
      navigator.geolocation.clearWatch(webWatchId.current);
      webWatchId.current = null;
    }
    if (nativeWatch.current) { nativeWatch.current.remove(); nativeWatch.current = null; }
  };

  useEffect(() => () => stopWatch(), []);

  const finish = async () => {
    setFinishing(true);
    try {
      await fetch(`${API}/courier/order/${order.code}/finish`, { method: "POST" });
      stopWatch();
      setFinished(true);
      setRouteStarted(false);
      loadOrders();
      setBalance(null);
    } finally {
      setFinishing(false);
    }
  };

  const clearOrder = () => {
    stopWatch();
    setOrder(null); setCode(""); setError(null); setRouteStarted(false); setFinished(false); setGpsInfo("");
  };

  const addr = order?.address;
  const hasCoords = addr && addr.lat != null && addr.lng != null;
  const canRoute = !!addr && (hasCoords || !!addr.street);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.logo}><Text style={styles.logoText}>Z</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Olá, {user?.name?.split(" ")[0] || "Entregador"}</Text>
          <Text style={styles.subtitle}>Área do entregador</Text>
        </View>
        <Pressable testID="entregador-logout" style={styles.logoutBtn} onPress={signOut}>
          <Ionicons name="log-out-outline" size={18} color={colors.error} />
          <Text style={styles.logoutText}>Sair</Text>
        </Pressable>
      </View>

      {user?.courier_code ? (
        <View style={styles.idCard} testID="courier-id-card">
          <View style={{ flex: 1 }}>
            <Text style={styles.idLabel}>Seu ID de entregador</Text>
            <Text style={styles.idCode} testID="courier-id-value">{user.courier_code}</Text>
            <Text style={styles.idHint}>Compartilhe com o lojista para receber convites.</Text>
          </View>
          <Pressable testID="courier-id-copy" style={[styles.copyBtn, copied && styles.copyBtnDone]} onPress={copyId}>
            <Ionicons name={copied ? "checkmark" : "copy-outline"} size={18} color="#fff" />
            <Text style={styles.copyText}>{copied ? "Copiado!" : "Copiar"}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.tabs}>
        <Pressable testID="tab-entregas" style={[styles.tab, mode === "entregas" && styles.tabOn]} onPress={() => setMode("entregas")}>
          <Ionicons name="bicycle" size={16} color={mode === "entregas" ? "#fff" : colors.brand} />
          <Text style={[styles.tabText, mode === "entregas" && styles.tabTextOn]}>Entregas</Text>
        </Pressable>
        <Pressable testID="tab-saldo" style={[styles.tab, mode === "saldo" && styles.tabOn]} onPress={() => setMode("saldo")}>
          <Ionicons name="wallet" size={16} color={mode === "saldo" ? "#fff" : colors.brand} />
          <Text style={[styles.tabText, mode === "saldo" && styles.tabTextOn]}>Meu saldo</Text>
        </Pressable>
      </View>

      {mode === "entregas" ? (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(); }} tintColor={colors.brand} />}
        >
          {invites.length > 0 && (
            <View style={styles.invitesBox} testID="entregador-invites">
              <Text style={styles.invitesTitle}>Convites de lojas</Text>
              {invites.map((iv) => (
                <View key={iv.id} style={styles.inviteRow}>
                  <Ionicons name="storefront" size={20} color={colors.brand} />
                  <Text style={styles.inviteName}>{iv.store_name}</Text>
                  <Pressable testID={`invite-accept-${iv.id}`} style={styles.inviteAccept} onPress={() => respondInvite(iv, true)}>
                    <Text style={styles.inviteAcceptText}>Aceitar</Text>
                  </Pressable>
                  <Pressable testID={`invite-reject-${iv.id}`} style={styles.inviteReject} onPress={() => respondInvite(iv, false)}>
                    <Text style={styles.inviteRejectText}>Recusar</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          <Text style={styles.label}>Buscar pedido pelo número</Text>
          <View style={styles.searchRow}>
            <TextInput
              testID="entregador-code-input"
              style={styles.input}
              placeholder="Ex: A1B2C3"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="characters"
              value={code}
              onChangeText={setCode}
              onSubmitEditing={() => openOrder(code)}
            />
            <Pressable testID="entregador-search" style={styles.searchBtn} onPress={() => openOrder(code)} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Ionicons name="search" size={22} color="#fff" />}
            </Pressable>
          </View>
          {error && <Text style={styles.error} testID="entregador-error">{error}</Text>}

          {order ? (
            <View style={styles.card} testID="entregador-order-card">
              <View style={styles.rowBetween}>
                <Text style={styles.orderCode}>#{order.code}</Text>
                <Pressable onPress={clearOrder} testID="entregador-clear"><Ionicons name="close-circle" size={24} color={colors.onSurfaceTertiary} /></Pressable>
              </View>
              <View style={[styles.statusPill, { backgroundColor: (STATUS_COLORS[order.status] || colors.info) + "22", alignSelf: "flex-start" }]}>
                <Text style={[styles.statusText, { color: STATUS_COLORS[order.status] || colors.info }]}>{STATUS_LABELS[order.status] || order.status}</Text>
              </View>
              <Text style={styles.storeLine}>{order.store?.name} → {order.customer_name}</Text>

              <View style={styles.addrBox}>
                <Ionicons name="location" size={20} color={colors.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.addrTitle}>Endereço do cliente</Text>
                  {addr ? (
                    <Text style={styles.addrText} testID="entregador-address">
                      {addr.street}, {addr.number}{addr.complement ? ` - ${addr.complement}` : ""}{"\n"}
                      {addr.neighborhood} • {addr.city}/{addr.state} {addr.zip ? `• ${addr.zip}` : ""}
                    </Text>
                  ) : <Text style={styles.addrText}>Endereço não informado</Text>}
                </View>
              </View>

              <Text style={styles.payLine}>Pagamento: {order.payment_method} • Total {brl(order.total)}</Text>

              {finished ? (
                <View style={styles.doneBox} testID="entregador-done">
                  <Ionicons name="checkmark-circle" size={28} color={colors.success} />
                  <Text style={styles.doneText}>Entrega finalizada! Cliente notificado.</Text>
                </View>
              ) : (
                <>
                  {!routeStarted ? (
                    <Pressable testID="entregador-start-route" style={[styles.primaryBtn, !canRoute && { opacity: 0.5 }]} disabled={!canRoute} onPress={startRoute}>
                      <Ionicons name="navigate" size={20} color="#fff" />
                      <Text style={styles.primaryText}>Iniciar rota</Text>
                    </Pressable>
                  ) : (
                    <>
                      <View style={styles.gpsBadge}>
                        <View style={styles.gpsDot} />
                        <Text style={styles.gpsText}>{gpsInfo || "Ativando GPS..."}</Text>
                      </View>
                      {hasCoords && (
                        <View style={{ marginTop: spacing.md }}>
                          <LiveMap code={order.code} dest={{ lat: addr.lat, lng: addr.lng }} store={order.store} height={260} />
                        </View>
                      )}
                      <Pressable testID="entregador-reopen-maps" style={styles.secondaryBtn} onPress={() => setNavOpen(true)}>
                        <Ionicons name="map" size={18} color={colors.brand} />
                        <Text style={styles.secondaryText}>Abrir navegação</Text>
                      </Pressable>
                      <Pressable testID="entregador-finish" style={styles.finishBtn} onPress={finish} disabled={finishing}>
                        {finishing ? <ActivityIndicator color="#fff" /> : (
                          <>
                            <Ionicons name="checkmark-done" size={20} color="#fff" />
                            <Text style={styles.primaryText}>Finalizar entrega</Text>
                          </>
                        )}
                      </Pressable>
                    </>
                  )}
                </>
              )}
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Pedidos atribuídos a você</Text>
              {orders.length === 0 ? (
                <View style={styles.hint}>
                  <Ionicons name="cube-outline" size={48} color={colors.onSurfaceTertiary} />
                  <Text style={styles.hintText}>Nenhum pedido atribuído ainda. Puxe para atualizar.</Text>
                </View>
              ) : (
                orders.map((o) => {
                  const active = ACTIVE.includes(o.status);
                  return (
                    <Pressable key={o.id} testID={`entregador-order-${o.code}`} style={styles.listRow} onPress={() => openOrder(o.code)}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.listCode}>#{o.code} • {o.customer_name}</Text>
                        <Text style={styles.listSub} numberOfLines={1}>
                          {o.address ? `${o.address.street}, ${o.address.number} • ${o.address.neighborhood}` : "Sem endereço"}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <View style={[styles.miniPill, { backgroundColor: (STATUS_COLORS[o.status] || colors.info) + "22" }]}>
                          <Text style={[styles.miniPillText, { color: STATUS_COLORS[o.status] || colors.info }]}>{STATUS_LABELS[o.status] || o.status}</Text>
                        </View>
                        {active && <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} style={{ marginTop: 4 }} />}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={balLoading} onRefresh={loadBalance} tintColor={colors.brand} />}>
          {balLoading && !balance ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
          ) : balance ? (
            <View style={styles.card} testID="entregador-balance">
              <Text style={styles.balHint}>Seus ganhos com entregas (soma das taxas de entrega):</Text>
              <BalRow label="Hoje" icon="today" data={balance.day} highlight />
              <BalRow label="Esta semana" icon="calendar" data={balance.week} />
              <BalRow label="Este mês" icon="calendar-clear" data={balance.month} />
              {balance.day_orders?.length > 0 && (
                <View style={styles.histBox}>
                  <Text style={styles.histTitle}>Entregas de hoje</Text>
                  {balance.day_orders.map((o: any) => (
                    <View key={o.id} style={styles.histRow}>
                      <Text style={styles.histTime}>{o.at}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.histCode}>#{o.code}</Text>
                        <Text style={styles.histSub} numberOfLines={1}>{o.customer_name}</Text>
                      </View>
                      <Text style={styles.histFee}>{brl(o.delivery_fee)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : null}
        </ScrollView>
      )}

      <Modal visible={navOpen} transparent animationType="fade" onRequestClose={() => setNavOpen(false)}>
        <Pressable style={styles.navWrap} onPress={() => setNavOpen(false)}>
          <View style={styles.navCard} testID="nav-modal">
            <Text style={styles.navTitle}>Abrir navegação</Text>
            <Text style={styles.navSub}>Escolha o app para traçar a rota até o cliente</Text>
            <Pressable testID="nav-google" style={[styles.navBtn, { backgroundColor: "#1a73e8" }]} onPress={() => openMaps("google")}>
              <Ionicons name="navigate" size={20} color="#fff" />
              <Text style={styles.navBtnText}>Google Maps</Text>
            </Pressable>
            <Pressable testID="nav-waze" style={[styles.navBtn, { backgroundColor: "#33ccff" }]} onPress={() => openMaps("waze")}>
              <Ionicons name="car-sport" size={20} color="#fff" />
              <Text style={styles.navBtnText}>Waze</Text>
            </Pressable>
            <Pressable testID="nav-cancel" style={styles.navCancel} onPress={() => setNavOpen(false)}>
              <Text style={styles.navCancelText}>Cancelar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={!!activeOffer} transparent animationType="slide" onRequestClose={() => respondOffer(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.offerCard} testID="offer-modal">
            <View style={styles.offerBell}><Ionicons name="notifications" size={28} color="#fff" /></View>
            <Text style={styles.offerTitle}>Novo pedido para entrega</Text>
            {activeOffer && (
              <>
                <Text style={styles.offerStore}>{activeOffer.store_name} • #{activeOffer.code}</Text>
                <View style={styles.offerRow}>
                  <Ionicons name="cube" size={18} color={colors.brand} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.offerLabel}>Coleta</Text>
                    <Text style={styles.offerText}>{activeOffer.pickup?.name}{activeOffer.pickup?.address?.street ? ` — ${activeOffer.pickup.address.street}, ${activeOffer.pickup.address.number || ""}` : ""}</Text>
                  </View>
                </View>
                <View style={styles.offerRow}>
                  <Ionicons name="location" size={18} color={colors.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.offerLabel}>Entrega</Text>
                    <Text style={styles.offerText}>
                      {activeOffer.delivery ? `${activeOffer.delivery.street}, ${activeOffer.delivery.number} • ${activeOffer.delivery.neighborhood}, ${activeOffer.delivery.city}` : "—"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.offerFee}>Você recebe {brl(activeOffer.delivery_fee || 0)}</Text>
                <View style={styles.offerActions}>
                  <Pressable testID="offer-refuse" style={styles.refuseBtn} onPress={() => respondOffer(false)}>
                    <Text style={styles.refuseText}>Recusar</Text>
                  </Pressable>
                  <Pressable testID="offer-accept" style={styles.acceptBtn} onPress={() => respondOffer(true)}>
                    <Text style={styles.acceptText}>Aceitar</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function BalRow({ label, icon, data, highlight }: { label: string; icon: any; data: any; highlight?: boolean }) {
  return (
    <View style={styles.balBlock}>
      <View style={[styles.balRow, highlight && styles.balRowHi]}>
        <View style={[styles.balIcon, highlight && { backgroundColor: colors.brand }]}>
          <Ionicons name={icon} size={18} color={highlight ? "#fff" : colors.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.balLabel}>{label}</Text>
          <Text style={styles.balCount}>{data?.count || 0} entrega{(data?.count || 0) !== 1 ? "s" : ""}</Text>
        </View>
        <Text style={[styles.balValue, highlight && { color: colors.brand }]}>{brl(data?.total || 0)}</Text>
      </View>
      {(data?.stores || []).length > 0 && (
        <View style={styles.storeBreak}>
          {data.stores.map((s: any, i: number) => (
            <View key={i} style={styles.storeBreakRow}>
              <Ionicons name="storefront-outline" size={13} color={colors.onSurfaceSecondary} />
              <Text style={styles.storeBreakName} numberOfLines={1}>{s.store_name}</Text>
              <Text style={styles.storeBreakCount}>{s.count}x</Text>
              <Text style={styles.storeBreakTotal}>{brl(s.total)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const makeStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  logo: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontSize: 24, fontWeight: "800" },
  title: { fontSize: font.size.xl, fontWeight: "800", color: colors.onSurface },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: font.size.sm },
  logoutBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.error },
  logoutText: { color: colors.error, fontWeight: "700", fontSize: font.size.sm },
  idCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.brand, borderRadius: radius.md, padding: spacing.md },
  idLabel: { color: "rgba(255,255,255,0.85)", fontSize: font.size.sm, fontWeight: "600" },
  idCode: { color: "#fff", fontSize: font.size.xxl, fontWeight: "800", letterSpacing: 2, marginTop: 2 },
  idHint: { color: "rgba(255,255,255,0.85)", fontSize: font.size.sm, marginTop: 2 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.25)", borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  copyBtnDone: { backgroundColor: colors.success },
  copyText: { color: "#fff", fontWeight: "800", fontSize: font.size.sm },
  tabs: { flexDirection: "row", gap: spacing.sm, margin: spacing.lg, marginBottom: 0, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, padding: 4 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.md, borderRadius: radius.pill },
  tabOn: { backgroundColor: colors.brand },
  tabText: { color: colors.brand, fontWeight: "700" },
  tabTextOn: { color: "#fff" },
  label: { color: colors.onSurfaceSecondary, fontWeight: "600", marginBottom: spacing.xs },
  searchRow: { flexDirection: "row", gap: spacing.sm },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: font.size.xl, letterSpacing: 2, color: colors.onSurface, backgroundColor: colors.surfaceSecondary, fontWeight: "700" },
  searchBtn: { width: 56, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  error: { color: colors.error, marginTop: spacing.sm },
  sectionTitle: { fontWeight: "800", color: colors.onSurface, fontSize: font.size.lg, marginTop: spacing.lg, marginBottom: spacing.sm },
  listRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.sm },
  listCode: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.base },
  listSub: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, marginTop: 2 },
  miniPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  miniPillText: { fontWeight: "700", fontSize: font.size.sm },
  card: { marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderCode: { fontSize: font.size.xxl, fontWeight: "800", color: colors.onSurface, letterSpacing: 1 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, marginTop: spacing.xs },
  statusText: { fontWeight: "700", fontSize: font.size.sm },
  storeLine: { color: colors.onSurfaceSecondary, marginTop: spacing.sm },
  addrBox: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  addrTitle: { fontWeight: "700", color: colors.onSurface },
  addrText: { color: colors.onSurfaceSecondary, marginTop: 2, lineHeight: 20 },
  payLine: { color: colors.onSurfaceSecondary, marginTop: spacing.sm },
  primaryBtn: { flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.lg, marginTop: spacing.lg },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: font.size.lg },
  finishBtn: { flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.success, borderRadius: radius.md, paddingVertical: spacing.lg, marginTop: spacing.md },
  secondaryBtn: { flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.md },
  secondaryText: { color: colors.brand, fontWeight: "700" },
  gpsBadge: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg, backgroundColor: colors.success + "18", padding: spacing.md, borderRadius: radius.md },
  gpsDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  gpsText: { color: colors.onSurface, fontWeight: "600", fontSize: font.size.sm },
  doneBox: { flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.success + "18", borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.lg },
  doneText: { color: colors.success, fontWeight: "700", fontSize: font.size.lg, flex: 1 },
  hint: { alignItems: "center", padding: spacing.xxl },
  hintText: { color: colors.onSurfaceSecondary, textAlign: "center", marginTop: spacing.md },
  balHint: { color: colors.onSurfaceSecondary, marginBottom: spacing.md, fontSize: font.size.sm },
  balRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  balRowHi: {},
  balIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  balLabel: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
  balCount: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, marginTop: 2 },
  balValue: { fontWeight: "800", color: colors.success, fontSize: font.size.xl },
  histBox: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md },
  histTitle: { fontWeight: "800", color: colors.onSurface, fontSize: font.size.lg, marginBottom: spacing.sm },
  histRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  histTime: { color: colors.onSurfaceSecondary, fontWeight: "600", fontSize: font.size.sm, width: 44 },
  histCode: { fontWeight: "700", color: colors.brand, fontSize: font.size.base },
  histSub: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, marginTop: 1 },
  histFee: { fontWeight: "800", color: colors.onSurface, fontSize: font.size.lg },
  invitesBox: { backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  invitesTitle: { fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  inviteRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  inviteName: { flex: 1, fontWeight: "700", color: colors.onSurface },
  inviteAccept: { backgroundColor: colors.success, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  inviteAcceptText: { color: "#fff", fontWeight: "700", fontSize: font.size.sm },
  inviteReject: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  inviteRejectText: { color: colors.error, fontWeight: "700", fontSize: font.size.sm },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  navWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: spacing.xl },
  navCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  navTitle: { fontSize: font.size.xl, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  navSub: { color: colors.onSurfaceSecondary, textAlign: "center", fontSize: font.size.sm },
  navBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.md, paddingVertical: spacing.lg },
  navBtnText: { color: "#fff", fontWeight: "800", fontSize: font.size.lg },
  navCancel: { alignItems: "center", paddingVertical: spacing.sm },
  navCancelText: { color: colors.onSurfaceSecondary, fontWeight: "700" },
  offerCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  offerBell: { alignSelf: "center", width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  offerTitle: { fontSize: font.size.xl, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  offerStore: { textAlign: "center", color: colors.onSurfaceSecondary, fontWeight: "600" },
  offerRow: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, alignItems: "flex-start" },
  offerLabel: { fontWeight: "700", color: colors.onSurface },
  offerText: { color: colors.onSurfaceSecondary, marginTop: 2 },
  offerFee: { textAlign: "center", fontSize: font.size.xl, fontWeight: "800", color: colors.success },
  offerActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  refuseBtn: { flex: 1, borderWidth: 1, borderColor: colors.error, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: "center" },
  refuseText: { color: colors.error, fontWeight: "800", fontSize: font.size.lg },
  acceptBtn: { flex: 1, backgroundColor: colors.success, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: "center" },
  acceptText: { color: "#fff", fontWeight: "800", fontSize: font.size.lg },
  balBlock: { borderTopWidth: 1, borderTopColor: colors.divider },
  storeBreak: { paddingLeft: 52, paddingBottom: spacing.sm, gap: 4 },
  storeBreakRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  storeBreakName: { flex: 1, color: colors.onSurfaceSecondary, fontSize: font.size.sm },
  storeBreakCount: { color: colors.onSurfaceTertiary, fontSize: font.size.sm, width: 34, textAlign: "right" },
  storeBreakTotal: { color: colors.onSurface, fontWeight: "700", fontSize: font.size.sm, width: 72, textAlign: "right" },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
