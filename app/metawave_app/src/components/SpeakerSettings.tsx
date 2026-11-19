import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Audio } from "expo-av";
import { API_BASE } from "../config";
import { settingsStyles as styles } from "../styles/settingsStyles";

type SpeakerConfig = { enabled: boolean; times: string[]; rss_urls: string[] };
type SpeakerJob = { id: string; state: string; error?: string };
type SpeakerStatus = { next_prepare: string | null; next_broadcast: string | null; job: SpeakerJob | null; latest: SpeakerJob | null; last_scheduled: { state: string; error?: string } | null };

export default function SpeakerSettings({ token, isDesktop }: { token: string; isDesktop: boolean }) {
  const [config, setConfig] = useState<SpeakerConfig | null>(null);
  const [times, setTimes] = useState("");
  const [status, setStatus] = useState<SpeakerStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const sound = useRef<Audio.Sound | null>(null);
  const mounted = useRef(true);

  const request = useCallback(async <T,>(path: string, method = "GET", data?: unknown): Promise<T> => {
    const res = await fetch(`${API_BASE}/speaker${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      const detail = typeof json?.detail === "string" ? json.detail : "Eingaben oder Verbindung prüfen.";
      throw new Error(detail);
    }
    return json as T;
  }, [token]);

  const load = useCallback(async () => {
    try {
      const [saved, current] = await Promise.all([request<SpeakerConfig>("/config"), request<SpeakerStatus>("/status")]);
      if (!mounted.current) return;
      setConfig(saved);
      setTimes(saved.times.join(", "));
      setStatus(current);
      setMessage("");
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : "Speaker nicht erreichbar.");
    }
  }, [request]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
      if (sound.current) sound.current.unloadAsync().catch(console.error);
      sound.current = null;
    };
  }, [load]);

  useEffect(() => {
    let active = true;
    const timer = setInterval(async () => {
      try {
        const current = await request<SpeakerStatus>("/status");
        if (active) setStatus(current);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "Speaker-Status nicht erreichbar.");
      }
    }, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [request]);

  const save = async (enabled: boolean) => {
    if (!config) throw new Error("Speaker-Einstellungen sind nicht geladen.");
    const parsedTimes = times.split(",").map(value => value.trim()).filter(Boolean);
    if (!parsedTimes.length || parsedTimes.some(value => !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) || new Set(parsedTimes).size !== parsedTimes.length) {
      throw new Error("Bitte unterschiedliche Sendezeiten im Format HH:MM durch Kommas getrennt eingeben.");
    }
    const saved = await request<SpeakerConfig>("/config", "POST", { ...config, enabled, times: parsedTimes });
    if (mounted.current) {
      setConfig(saved);
      setTimes(saved.times.join(", "));
      setStatus(await request<SpeakerStatus>("/status"));
    }
  };

  const saveSettings = async (enabled: boolean) => {
    setBusy(true);
    try {
      await save(enabled);
      if (mounted.current) setMessage("Einstellungen gespeichert.");
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : "Speichern fehlgeschlagen.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const playPreview = useCallback(async (jobId?: string) => {
    try {
      if (sound.current) await sound.current.unloadAsync();
      sound.current = null;
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound: next } = await Audio.Sound.createAsync(
        { uri: `${API_BASE}/speaker${jobId ? `/jobs/${jobId}/audio` : "/audio/latest"}?token=${encodeURIComponent(token)}&v=${Date.now()}` },
        { shouldPlay: true },
      );
      if (!mounted.current) {
        await next.unloadAsync();
        return;
      }
      sound.current = next;
      setMessage("Vorschau wird nur auf diesem Gerät abgespielt.");
    } catch (error) {
      console.error("Speaker preview failed", error);
      if (mounted.current) setMessage("Vorschau konnte nicht abgespielt werden. Bitte erneut auf „Vorschau abspielen“ drücken.");
    }
  }, [token]);

  const trigger = async () => {
    if (!config) return;
    setBusy(true);
    try {
      await save(config.enabled);
      const job = await request<SpeakerJob>("/trigger-prepare", "POST", {});
      if (mounted.current) {
        setActiveJob(job.id);
        setMessage("Vorschau wird vorbereitet; das erste Laden der Modelle kann länger dauern.");
      }
    } catch (error) {
      if (mounted.current) {
        setMessage(error instanceof Error ? error.message : "Vorbereitung fehlgeschlagen.");
        setBusy(false);
      }
    }
  };

  useEffect(() => {
    if (!activeJob) return;
    let cancelled = false;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const [current, job] = await Promise.all([
          request<SpeakerStatus>("/status"), request<SpeakerJob>(`/jobs/${activeJob}`),
        ]);
        if (cancelled) return;
        setStatus(current);
        if (job.state === "failed") throw new Error(job.error || "Vorbereitung fehlgeschlagen.");
        if (job.state === "ready") {
          setActiveJob(null);
          setBusy(false);
          await playPreview(activeJob);
        }
      } catch (error) {
        if (!cancelled) {
          setActiveJob(null);
          setBusy(false);
          setMessage(error instanceof Error ? error.message : "Status konnte nicht geladen werden.");
        }
      } finally {
        checking = false;
      }
    };
    const timer = setInterval(check, 2000);
    check();
    return () => { cancelled = true; clearInterval(timer); };
  }, [activeJob, playPreview, request]);

  const formatDate = (value: string | null | undefined) => value
    ? new Date(value).toLocaleString("de-CH", { timeZone: "Europe/Zurich" })
    : "–";

  return (
    <View style={[styles.section, isDesktop && { flex: 1, maxWidth: 400 }]}>
      <Text style={styles.sectionTitle}>Speaker</Text>
      {!config ? (
        <View style={styles.settingCard}>
          <Text style={styles.settingDescription}>{message || "Speaker wird geladen…"}</Text>
          <TouchableOpacity style={styles.scheduleSaveButton} onPress={load}>
            <Text style={styles.scheduleSaveButtonText}>Erneut laden</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.settingCard}>
          <View style={styles.scheduleHeader}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Automatische Beiträge</Text>
              <Text style={styles.settingDescription}>Vorbereitung eine Stunde vor der Sendezeit (Europe/Zurich)</Text>
            </View>
            <Switch value={config.enabled} disabled={busy} onValueChange={saveSettings}
              trackColor={{ false: "#3a3a3a", true: "#4CAF50" }} thumbColor="#ffffff" />
          </View>
          <Text style={[styles.timeLabel, { marginTop: 16 }]}>Sendezeiten (HH:MM, durch Kommas getrennt)</Text>
          <TextInput value={times} onChangeText={setTimes} style={styles.timeInput} editable={!busy} />
          {["IT", "Schweiz", "Zürich"].map((label, index) => (
            <View key={label}>
              <Text style={[styles.timeLabel, { marginTop: 12 }]}>{label}: RSS-URL</Text>
              <TextInput value={config.rss_urls[index]} editable={!busy} autoCapitalize="none" autoCorrect={false}
                style={styles.timeInput}
                onChangeText={value => setConfig({ ...config, rss_urls: config.rss_urls.map((url, i) => i === index ? value : url) })} />
            </View>
          ))}
          <TouchableOpacity style={[styles.scheduleSaveButton, busy && styles.scheduleSaveButtonDisabled]}
            disabled={busy} onPress={() => saveSettings(config.enabled)}>
            <Text style={styles.scheduleSaveButtonText}>Speaker speichern</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.scheduleSaveButton, busy && styles.scheduleSaveButtonDisabled]} disabled={busy} onPress={trigger}>
            <Text style={styles.scheduleSaveButtonText}>Jetzt testen / Vorschau generieren</Text>
          </TouchableOpacity>
          {status?.latest && <TouchableOpacity style={styles.scheduleSaveButton} onPress={() => playPreview()}>
            <Text style={styles.scheduleSaveButtonText}>Vorschau abspielen</Text>
          </TouchableOpacity>}
          {busy && <ActivityIndicator color="#ffffff" style={{ marginTop: 12 }} />}
          <Text style={[styles.settingDescription, { marginTop: 12 }]}>Nächste Vorbereitung: {formatDate(status?.next_prepare)}</Text>
          <Text style={styles.settingDescription}>Nächste Sendung: {formatDate(status?.next_broadcast)}</Text>
          {!!status?.last_scheduled?.error && <Text style={[styles.settingDescription, { marginTop: 8 }]}>
            Letzter geplanter Beitrag: {status.last_scheduled.error}
          </Text>}
          {!!message && <Text style={[styles.settingDescription, { marginTop: 12 }]}>{message}</Text>}
        </View>
      )}
    </View>
  );
}
