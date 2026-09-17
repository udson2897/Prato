import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, registerThemedStyles } from "@/src/theme";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const m = await api.listChat(id as string);
      setMessages(m);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    } catch {}
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const send = async () => {
    if (!text.trim()) return;
    const t = text.trim();
    setText("");
    await api.sendChat(id as string, t);
    load();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="chat-back">
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Chat com a loja</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 && (
            <Text style={styles.empty}>Envie uma mensagem para começar</Text>
          )}
          {messages.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <View
                key={m.id}
                testID={`chat-msg-${m.id}`}
                style={[styles.bubble, mine ? styles.mine : styles.theirs]}
              >
                {!mine && <Text style={styles.sender}>{m.sender_name}</Text>}
                <Text style={[styles.text, mine && { color: "#fff" }]}>{m.text}</Text>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            testID="chat-input"
            value={text}
            onChangeText={setText}
            placeholder="Digite uma mensagem..."
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.input}
          />
          <Pressable testID="chat-send" style={styles.sendBtn} onPress={send}>
            <Ionicons name="send" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
  headerTitle: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  empty: { textAlign: "center", color: colors.onSurfaceTertiary, marginTop: spacing.xl },
  bubble: { maxWidth: "78%", padding: spacing.md, borderRadius: radius.md },
  mine: { alignSelf: "flex-end", backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  theirs: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderBottomLeftRadius: 4 },
  sender: { color: colors.onSurfaceTertiary, fontSize: font.size.sm, fontWeight: "600", marginBottom: 2 },
  text: { color: colors.onSurface, fontSize: font.size.lg },
  inputBar: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface,
  },
  input: {
    flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, color: colors.onSurface, fontSize: font.size.lg,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
