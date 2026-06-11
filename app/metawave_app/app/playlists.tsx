import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_BASE } from "../src/config";
import { playlistsStyles as styles } from "../src/styles/playlistsStyles";

interface Playlist {
  id: number;
  name: string;
  url: string;
  is_active: boolean | number;
}

interface SyncStatus {
  running: boolean;
  step: string | null;
  lastRun: number | null;
  lastRunFormatted: string | null;
  lastError: string | null;
  log: string[];
}

export default function PlaylistsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  const tokenRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  // Sync state
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncTriggering, setSyncTriggering] = useState(false);
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const logout = async () => {
    await AsyncStorage.removeItem("authToken");
    router.replace("/");
  };

  // ─── Sync helpers ───────────────────────────────────────────────────────────

  const fetchSyncStatus = useCallback(async () => {
    if (!tokenRef.current) return;
    try {
      const res = await fetch(`${API_BASE}/playlist/sync/status`, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      if (res.ok) {
        const json: SyncStatus = await res.json();
        setSyncStatus(json);
        // Stop polling when no longer running
        if (!json.running && syncPollRef.current) {
          clearInterval(syncPollRef.current);
          syncPollRef.current = null;
        }
      }
    } catch {
      // non-fatal
    }
  }, []);

  const startSyncPolling = useCallback(() => {
    if (syncPollRef.current) return; // already polling
    syncPollRef.current = setInterval(fetchSyncStatus, 2500);
  }, [fetchSyncStatus]);

  const triggerSync = async () => {
    if (!tokenRef.current || syncTriggering || syncStatus?.running) return;
    setSyncTriggering(true);
    try {
      const res = await fetch(`${API_BASE}/playlist/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      if (res.status === 409) {
        // Already running — just start polling
      } else if (!res.ok) {
        const json = await res.json();
        Alert.alert("Fehler", json.error ?? "Sync konnte nicht gestartet werden.");
        return;
      }
      // Start polling for status updates
      await fetchSyncStatus();
      startSyncPolling();
    } catch {
      Alert.alert("Fehler", "Verbindung zum Server fehlgeschlagen.");
    } finally {
      setSyncTriggering(false);
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (syncPollRef.current) clearInterval(syncPollRef.current);
    };
  }, []);

  const loadPlaylists = useCallback(async () => {
    if (!tokenRef.current) return;
    try {
      const res = await fetch(`${API_BASE}/playlist`, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      if (!res.ok) {
        if (res.status === 401) {
          await AsyncStorage.removeItem("authToken");
          router.replace("/");
          return;
        }
        return;
      }
      const json = await res.json();
      setPlaylists(json.playlists ?? []);
    } catch {
      // ignore
    }
  }, [router]);

  useEffect(() => {
    const init = async () => {
      try {
        const stored = await AsyncStorage.getItem("authToken");
        if (!stored) {
          router.replace("/");
          return;
        }
        tokenRef.current = stored;
        await Promise.all([loadPlaylists(), fetchSyncStatus()]);
      } catch {
        Alert.alert("Fehler", "Playlists konnten nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [loadPlaylists, fetchSyncStatus, router]);

  const handleAdd = async () => {
    const name = newName.trim();
    const url = newUrl.trim();
    if (!name || !url) {
      Alert.alert("Fehler", "Bitte Name und URL eingeben.");
      return;
    }
    if (!tokenRef.current) return;

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/playlist`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenRef.current}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, url }),
      });
      const json = await res.json();
      if (!res.ok) {
        Alert.alert("Fehler", json.error ?? "Playlist konnte nicht hinzugefügt werden.");
        return;
      }
      setNewName("");
      setNewUrl("");
      await loadPlaylists();
    } catch {
      Alert.alert("Fehler", "Verbindung zum Server fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (playlist: Playlist) => {
    if (!tokenRef.current) return;
    const newActive = !playlist.is_active;
    // Optimistic update
    setPlaylists((prev) =>
      prev.map((p) => (p.id === playlist.id ? { ...p, is_active: newActive } : p))
    );
    try {
      const res = await fetch(`${API_BASE}/playlist/${playlist.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${tokenRef.current}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_active: newActive }),
      });
      if (!res.ok) {
        // Revert
        setPlaylists((prev) =>
          prev.map((p) => (p.id === playlist.id ? { ...p, is_active: playlist.is_active } : p))
        );
        Alert.alert("Fehler", "Status konnte nicht geändert werden.");
      }
    } catch {
      setPlaylists((prev) =>
        prev.map((p) => (p.id === playlist.id ? { ...p, is_active: playlist.is_active } : p))
      );
      Alert.alert("Fehler", "Verbindung zum Server fehlgeschlagen.");
    }
  };

  const handleDelete = async (playlist: Playlist) => {
    if (!tokenRef.current) return;
    const confirm = () =>
      new Promise<boolean>((resolve) => {
        if (Platform.OS === "web") {
          resolve(window.confirm(`Playlist "${playlist.name}" wirklich löschen?`));
        } else {
          Alert.alert(
            "Playlist löschen",
            `"${playlist.name}" wirklich löschen?`,
            [
              { text: "Abbrechen", style: "cancel", onPress: () => resolve(false) },
              { text: "Löschen", style: "destructive", onPress: () => resolve(true) },
            ]
          );
        }
      });

    const ok = await confirm();
    if (!ok) return;

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/playlist/${playlist.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      if (!res.ok) {
        const json = await res.json();
        Alert.alert("Fehler", json.error ?? "Playlist konnte nicht gelöscht werden.");
        return;
      }
      setPlaylists((prev) => prev.filter((p) => p.id !== playlist.id));
    } catch {
      Alert.alert("Fehler", "Verbindung zum Server fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.loadingText}>Playlists werden geladen…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={[styles.headerRow, isDesktop && styles.headerRowDesktop]}>
        <Text style={styles.headerTitle} selectable={false}>MetaWave</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity
            style={styles.headerIcon}
            onPress={loadPlaylists}
          >
            <Ionicons name="refresh-outline" size={18} color="#737373" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerIcon}
            onPress={() => router.push("/settings" as any)}
          >
            <Ionicons name="settings-outline" size={18} color="#737373" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={logout}>
            <Ionicons name="log-out-outline" size={18} color="#FF6B6B" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Playlist Manager</Text>

        {/* Info box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Aktive Playlists werden beim nächsten monatlichen Downloader-Lauf synchronisiert.
            Inaktive Playlists werden ignoriert.
          </Text>
        </View>

        {/* Sync card */}
        <View style={styles.syncCard}>
          <View style={styles.syncCardHeader}>
            <Text style={styles.syncCardTitle}>Songs synchronisieren</Text>
            <TouchableOpacity
              style={[styles.syncButton, (syncStatus?.running || syncTriggering) && styles.syncButtonRunning]}
              onPress={triggerSync}
              disabled={syncStatus?.running || syncTriggering}
            >
              {syncStatus?.running || syncTriggering ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="sync-outline" size={16} color="#fff" />
              )}
              <Text style={styles.syncButtonText}>
                {syncStatus?.running ? "Läuft…" : "Jetzt synchronisieren"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Status row */}
          {syncStatus && (
            <View style={styles.syncStatusRow}>
              <View style={[
                styles.syncStatusDot,
                {
                  backgroundColor: syncStatus.running
                    ? "#f5a623"
                    : syncStatus.lastError
                    ? "#FF6B6B"
                    : syncStatus.step === "done"
                    ? "#4CAF50"
                    : "#737373",
                },
              ]} />
              <Text style={styles.syncStatusText}>
                {syncStatus.running
                  ? `Schritt: ${syncStatus.step ?? "…"}`
                  : syncStatus.lastError
                  ? `Fehler: ${syncStatus.lastError}`
                  : syncStatus.lastRunFormatted
                  ? `Zuletzt synchronisiert: ${syncStatus.lastRunFormatted}`
                  : "Noch nicht synchronisiert"}
              </Text>
            </View>
          )}

          {/* Log output (only while running or after error) */}
          {syncStatus && (syncStatus.running || syncStatus.lastError) && syncStatus.log.length > 0 && (
            <ScrollView style={styles.syncLogBox} nestedScrollEnabled>
              {syncStatus.log.slice(-20).map((line, i) => (
                <Text
                  key={i}
                  style={[
                    styles.syncLogLine,
                    (line.includes("FEHLER") || line.includes("Fehler")) && styles.syncLogLineError,
                  ]}
                  selectable={false}
                >
                  {line}
                </Text>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Add new playlist */}
        <View style={styles.addCard}>
          <Text style={styles.addTitle}>Playlist hinzufügen</Text>
          <TextInput
            style={styles.input}
            placeholder="Name (z.B. Meine Lieblingsmusik)"
            placeholderTextColor="#555"
            value={newName}
            onChangeText={setNewName}
            editable={!saving}
          />
          <TextInput
            style={styles.input}
            placeholder="YouTube Playlist URL"
            placeholderTextColor="#555"
            value={newUrl}
            onChangeText={setNewUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!saving}
          />
          <TouchableOpacity
            style={[styles.addButton, (!newName.trim() || !newUrl.trim() || saving) && styles.addButtonDisabled]}
            onPress={handleAdd}
            disabled={!newName.trim() || !newUrl.trim() || saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.addButtonText}>Hinzufügen</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Playlist list */}
        {playlists.length === 0 ? (
          <Text style={styles.emptyText}>
            Noch keine Playlists vorhanden.{"\n"}
            Füge oben eine YouTube Playlist URL hinzu.
          </Text>
        ) : (
          playlists.map((pl) => {
            const isActive = Boolean(pl.is_active);
            return (
              <View
                key={pl.id}
                style={[styles.playlistCard, !isActive && styles.playlistCardInactive]}
              >
                <View style={styles.playlistInfo}>
                  <Text style={styles.playlistName} numberOfLines={1}>{pl.name}</Text>
                  <Text style={styles.playlistUrl} numberOfLines={1}>{pl.url}</Text>
                  <Text
                    style={[
                      styles.playlistStatus,
                      isActive ? styles.playlistStatusActive : styles.playlistStatusInactive,
                    ]}
                  >
                    {isActive ? "Aktiv" : "Inaktiv"}
                  </Text>
                </View>
                <View style={styles.playlistActions}>
                  <Switch
                    value={isActive}
                    onValueChange={() => handleToggleActive(pl)}
                    disabled={saving}
                    trackColor={{ false: "#3a3a3a", true: "#4CAF50" }}
                    thumbColor={isActive ? "#ffffff" : "#dddddd"}
                    ios_backgroundColor="#3a3a3a"
                  />
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(pl)}
                    disabled={saving}
                  >
                    <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        {/* Back button (desktop) */}
        {isDesktop && (
          <View style={styles.desktopBackButtonContainer}>
            <TouchableOpacity
              style={styles.desktopBackButton}
              onPress={() => router.push("/settings" as any)}
            >
              <Text style={styles.desktopBackButtonText}>Zurück zu Einstellungen</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Back button (mobile) */}
      {!isDesktop && (
        <View style={styles.mobileBackButtonContainer}>
          <TouchableOpacity
            style={styles.mobileBackButton}
            onPress={() => router.push("/settings" as any)}
          >
            <Text style={styles.mobileBackButtonText}>Zurück zu Einstellungen</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
