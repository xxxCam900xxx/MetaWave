import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, Image, Platform, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Audio, AVPlaybackStatus } from "expo-av";
import { API_BASE, WS_BASE } from "../src/config";
import { playerStyles as styles } from "../src/styles/playerStyles";

interface StreamMeta {
  filename?: string;
  title?: string;
  author?: string;
  duration?: number;
  cover?: string;
  index?: number;
  total?: number;
  elapsed?: number;
}

interface QueueItem {
  song: string;
  title: string;
  author: string;
  duration: number;
  cover?: string;
  index: number;
  isPlaying: boolean;
   hasBeenPlayed?: boolean;
}

const formatTime = (totalSeconds: number): string => {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const padded = seconds.toString().padStart(2, "0");
  return `${minutes}:${padded}`;
};

const formatEndClockTime = (remainingSeconds: number): string => {
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) return "";
  const end = new Date(Date.now() + remainingSeconds * 1000);
  const hours = end.getHours().toString().padStart(2, "0");
  const minutes = end.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};

export default function PlayerScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const windowHeight = Dimensions.get("window").height;
  const [meta, setMeta] = useState<StreamMeta | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState<number>(100);
  const [error, setError] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const tokenRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const metaIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queueScrollRef = useRef<any>(null);
  const queueItemLayoutRef = useRef<Record<number, number>>({});

  useEffect(() => {
    const init = async () => {
      try {
        const stored = await AsyncStorage.getItem("authToken");
        if (!stored) {
          router.replace("/");
          return;
        }

        tokenRef.current = stored;

        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
        });

        await startStream();
        await fetchMetadata();
        await fetchQueue();
        await loadVolume();
        setupWebSocket();
        await validateToken();

        metaIntervalRef.current = setInterval(fetchMetadata, 1000);
        authIntervalRef.current = setInterval(validateToken, 600000);
      } catch (err) {
        setError("Konnte Audio-Stream nicht starten.");
      } finally {
        setLoading(false);
      }
    };

    init();

    return () => {
      if (metaIntervalRef.current) {
        clearInterval(metaIntervalRef.current);
        metaIntervalRef.current = null;
      }

        if (authIntervalRef.current) {
          clearInterval(authIntervalRef.current);
          authIntervalRef.current = null;
        }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => undefined);
      }
    };
  }, []);

  const setupWebSocket = () => {
    if (!tokenRef.current) return;

    try {
      const wsUrl = WS_BASE + `/?token=${encodeURIComponent(tokenRef.current)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.type === "trackChanged" && data.meta) {
            setMeta(data.meta as StreamMeta);
          }
          if (data?.type === "queueUpdated" && data.queue) {
            const q = Array.isArray(data.queue?.queue) ? data.queue.queue : data.queue;
            setQueue(q as QueueItem[]);
          }
          if (data?.type === "volumeChanged" && typeof data.volume === "number") {
            setVolume(Number(data.volume));
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onerror = () => {
        // Fehler im Stillen ignorieren; HTTP-Fallback ist bereits geladen
      };

      ws.onclose = () => {
        wsRef.current = null;
      };
    } catch {
      // Wenn WS gar nicht erreichbar ist, bleibt HTTP-Initialzustand erhalten
    }
  };

  useEffect(() => {
    const scrollView = queueScrollRef.current;
    if (!scrollView) return;

    const activeItem = queue.find((item) => item.isPlaying);
    if (!activeItem) return;

    const y = queueItemLayoutRef.current[activeItem.index];
    if (typeof y === "number" && typeof scrollView.scrollTo === "function") {
      scrollView.scrollTo({ y: Math.max(y - 16, 0), animated: true });
    }
  }, [queue]);

  // load current volume from server
  const loadVolume = async () => {
    if (!tokenRef.current) return;
    try {
      const res = await fetch(`${API_BASE}/stream/control/volume`, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (typeof json?.volume === "number") setVolume(json.volume);
    } catch (e) {
      // ignore
    }
  };

  const validateToken = async () => {
    if (!tokenRef.current) return;
    try {
      const res = await fetch(`${API_BASE}/auth/validate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenRef.current}`, "Content-Type": "application/json" },
      });

      if (res.status === 401) {
        await AsyncStorage.removeItem("authToken");
        router.replace("/");
        return;
      }

      if (!res.ok) return;

      const json = await res.json();
      if (json?.token && typeof json.token === "string") {
        tokenRef.current = json.token;
        await AsyncStorage.setItem("authToken", json.token);
      }
    } catch (e) {
      // Ignore validation errors silently
    }
  };

  const handleStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if ((status as any).error) {
        setError("Fehler beim Abspielen des Streams.");
      }
      return;
    }

    setIsPlaying(status.isPlaying);
  };

  const startStream = async () => {
    if (!tokenRef.current) return;

    try {
      setPlaybackLoading(true);
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      const streamUrl = `${API_BASE}/stream?token=${encodeURIComponent(tokenRef.current)}`;

      const { sound } = await Audio.Sound.createAsync(
        {
          uri: streamUrl,
        },
        { shouldPlay: true }
      );

      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate(handleStatusUpdate);
      setError(null);
    } catch (err) {
      setError("Audio-Stream konnte nicht geladen werden.");
    } finally {
      setPlaybackLoading(false);
    }
  };

  const fetchMetadata = async () => {
    if (!tokenRef.current) return;

    try {
      const res = await fetch(`${API_BASE}/stream/meta/currentsong`, {
        headers: {
          Authorization: `Bearer ${tokenRef.current}`,
        },
      });

      if (res.status === 401) {
        await AsyncStorage.removeItem("authToken");
        router.replace("/");
        return;
      }

      if (!res.ok) return;

      const json = await res.json();
      if (json?.metadata) setMeta(json.metadata);
    } catch (err) {
      // Ignore polling errors briefly
    }
  };

  const fetchQueue = async () => {
    if (!tokenRef.current) return;

    try {
      const res = await fetch(`${API_BASE}/stream/meta/queue`, {
        headers: {
          Authorization: `Bearer ${tokenRef.current}`,
        },
      });

      if (!res.ok) return;

      const json = await res.json();
      if (Array.isArray(json?.metadata)) {
        setQueue(json.metadata as QueueItem[]);
      }
    } catch (err) {
      // Ignore Queue-Error so it doesn't block UI
    }
  };

  const togglePlayPause = async () => {
    if (!soundRef.current) {
      await startStream();
      return;
    }

    const status = await soundRef.current.getStatusAsync();
    if (!status.isLoaded) return;

    if (status.isPlaying) {
      await soundRef.current.pauseAsync();
    } else {
      await startStream();
    }
  };

  const callControl = async (path: string) => {
    if (!tokenRef.current) return;

    try {
      await fetch(`${API_BASE}${path}`, {
        headers: {
          Authorization: `Bearer ${tokenRef.current}`,
        },
      });
    } catch (err) {
      Alert.alert("Fehler", "Steuerbefehl konnte nicht gesendet werden.");
    }
  };

  const changeVolume = async (delta: number) => {
    if (!tokenRef.current) return;
    const newV = Math.max(0, Math.min(200, Math.round((volume || 0) + delta)));
    try {
      await fetch(`${API_BASE}/stream/control/sound/${newV}`, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      setVolume(newV);
    } catch (err) {
      Alert.alert("Fehler", "Lautstärke konnte nicht gesetzt werden.");
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem("authToken");
    router.replace("/");
  };

  const progress = (() => {
    if (!meta?.duration || !meta?.elapsed) return 0;
    return Math.min(1, Math.max(0, meta.elapsed / meta.duration));
  })();

  const elapsedSeconds = meta?.elapsed ?? 0;
  const durationSeconds = meta?.duration ?? 0;
  const remainingSeconds = Math.max(0, durationSeconds - elapsedSeconds);

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Player wird geladen…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>MetaWave</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.centerContent, isDesktop && styles.centerContentDesktop]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.playerColumn}>
          {meta?.cover ? (
            <Image source={{ uri: meta.cover }} style={styles.cover} />
          ) : (
            <View style={[styles.cover, styles.coverPlaceholder]}>
              <Text style={styles.coverPlaceholderText}>MetaWave</Text>
            </View>
          )}

          <View style={styles.metaBlock}>
            <Text style={styles.songTitle}>{meta?.title || "Unbekannter Titel"}</Text>
            <Text style={styles.songAuthor}>{meta?.author || "Unbekannter Künstler"}</Text>
            {meta?.index !== undefined && meta?.total !== undefined && (
              <Text style={styles.queueText}>
                Track {meta.index + 1} / {meta.total}
              </Text>
            )}
          </View>

          <View style={styles.progressBarWrapper}>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { flex: progress }]} />
              <View style={{ flex: 1 - progress }} />
            </View>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressLabel}>{formatTime(elapsedSeconds)}</Text>
              <View style={styles.progressRightBlock}>
                <Text style={styles.progressLabel}>-{formatTime(remainingSeconds)}</Text>
                {remainingSeconds > 0 && (
                  <Text style={styles.progressEndLabel}>Endet um {formatEndClockTime(remainingSeconds)}</Text>
                )}
              </View>
            </View>
            <View style={{ alignItems: "center", marginTop: 8 }}>
              <Text style={styles.queueText}>Lautstärke: {volume}%</Text>
            </View>
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.controlsRowMain}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => callControl("/stream/control/previous")}>
              <Text style={styles.secondaryButtonText}>{"<<"}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.playButton} onPress={togglePlayPause} disabled={playbackLoading}>
              {playbackLoading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.playButtonText}>{isPlaying ? "Pause" : "Play"}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={() => callControl("/stream/control/skip")}>
              <Text style={styles.secondaryButtonText}>{">>"}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.controlsRowSecondary}>
            <TouchableOpacity style={styles.chip} onPress={() => changeVolume(-10)}>
              <Text style={styles.chipText}>-10%</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.chip} onPress={() => callControl("/stream/control/shuffle")}>
              <Text style={styles.chipText}>Shuffle</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.chip} onPress={() => changeVolume(10)}>
              <Text style={styles.chipText}>+10%</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.queueContainer, isDesktop && styles.queueContainerDesktop]}>
          <Text style={styles.queueHeader}>Queue</Text>
          <ScrollView
            ref={queueScrollRef}
            style={styles.queueListContent}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator
            {...(Platform.OS === "web" ? ({ className: "queue-scroll" } as any) : {})}
          >
            <View
              style={{
                maxHeight: isDesktop ? windowHeight * 0.7 : windowHeight * 0.4,
              }}
            >
              {queue.map((item) => {
                const active = item.isPlaying;
                const played = item.hasBeenPlayed && !active;
                return (
                  <TouchableOpacity
                    key={item.index}
                    onLayout={(e) => {
                      queueItemLayoutRef.current[item.index] = e.nativeEvent.layout.y;
                    }}
                    style={[styles.queueItem, played && styles.queueItemPlayed, active && styles.queueItemActive]}
                    onPress={() => callControl(`/stream/control/jumpto/${item.index}`)}
                    activeOpacity={0.7}
                  >
                    {item.cover ? (
                      <Image source={{ uri: item.cover }} style={styles.queueThumbnail} />
                    ) : (
                      <View style={[styles.queueThumbnail, styles.queueThumbnailPlaceholder]}>
                        <Text style={styles.queueThumbnailText}>♪</Text>
                      </View>
                    )}

                    <View style={styles.queueTexts}>
                      <Text style={[styles.queueTitle, active && styles.queueTitleActive]} numberOfLines={1}>
                        {item.title || item.song}
                      </Text>
                      <Text style={styles.queueAuthor} numberOfLines={1}>
                        {item.author || "Unbekannter Künstler"}
                      </Text>
                    </View>
                    <Text style={styles.queueDuration}>{item.duration ? `${Math.round(item.duration / 60)} min` : ""}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
