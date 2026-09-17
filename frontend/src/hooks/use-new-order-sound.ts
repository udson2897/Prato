import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import { api } from "@/src/lib/api";

const beepSound = require("../../assets/sounds/new-order.wav");

/**
 * Polls the store's orders while the screen is focused and plays a beep
 * whenever a brand-new order (status AGUARDANDO_CONFIRMACAO) arrives.
 * The beep keeps repeating every `repeatMs` while there are pending new
 * orders, until the lojista accepts/rejects/opens them (clears newIds).
 */
export function useNewOrderSound(intervalMs = 10000, repeatMs = 4000) {
  const player = useAudioPlayer(beepSound);
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newIds, setNewIds] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);

  // Ensure the alert is loud and audible even with the iPhone on silent mode.
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: "duckOthers",
      allowsRecording: false,
    }).catch(() => {});
    try {
      player.volume = 1.0;
      player.muted = false;
    } catch {}
  }, [player]);

  const playBeep = useCallback(() => {
    try {
      player.volume = 1.0;
      player.muted = false;
      player.seekTo(0);
      player.play();
    } catch {}
  }, [player]);

  const poll = useCallback(async () => {
    try {
      const o = await api.storeOrders();
      setOrders(o);
      const pending = o
        .filter((x: any) => x.status === "AGUARDANDO_CONFIRMACAO")
        .map((x: any) => x.id);
      const fresh = pending.filter((id: string) => !seen.current.has(id));
      if (primed.current && fresh.length) {
        playBeep();
      }
      setNewIds((prev) => {
        let next = prev.filter((id) => pending.includes(id));
        if (primed.current && fresh.length) {
          next = Array.from(new Set([...next, ...fresh]));
        }
        return next;
      });
      seen.current = new Set(pending);
      primed.current = true;
    } catch {
    } finally {
      setLoading(false);
    }
  }, [playBeep]);

  const clearNew = useCallback((id: string) => {
    setNewIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const clearAllNew = useCallback(() => setNewIds([]), []);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      poll();
      const t = setInterval(poll, intervalMs);
      return () => {
        setFocused(false);
        clearInterval(t);
      };
    }, [poll, intervalMs])
  );

  // Repeat the alert every few seconds while there are unhandled new orders.
  useEffect(() => {
    if (!focused || newIds.length === 0) return;
    const t = setInterval(playBeep, repeatMs);
    return () => clearInterval(t);
  }, [focused, newIds.length, playBeep, repeatMs]);

  return { orders, loading, reload: poll, newIds, newCount: newIds.length, clearNew, clearAllNew };
}
