import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { ActivityIndicator, Alert, Animated, Dimensions, Image, PanResponder, Platform, ScrollView, Text, TouchableOpacity, View, useWindowDimensions, InteractionManager } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Audio, AVPlaybackStatus } from "expo-av";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
import { faArrowsRotate, faGear, faRightFromBracket, faBackwardStep, faForwardStep, faPlay, faPause, faShuffle, faVolumeHigh, faVolumeLow, faGripVertical } from "@fortawesome/free-solid-svg-icons";
import { API_BASE, WS_BASE } from "../src/config";
import { colors } from "../src/theme";
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
  lufsGainDb?: number;
  monotoneEnabled?: boolean;
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

// ─── Queue Item Component ───────────────────────────────────────────────────
interface QueueItemRowProps {
  item: QueueItem;
  arrayIndex: number;
  active: boolean;
  played: boolean;
  isDragSource: boolean;
  isDragTarget: boolean;
  onLayout: (idx: number, y: number) => void;
  onPress: () => void;
  onDragStart: (idx: number) => void;
  onDragMove: (moveY: number) => void;
  onDragEnd: () => void;
}

const QueueItemRow: React.FC<QueueItemRowProps> = React.memo(({
  item, arrayIndex, active, played, isDragSource, isDragTarget,
  onLayout, onPress, onDragStart, onDragMove, onDragEnd,
}) => {
  const gripPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderGrant: () => { onDragStart(arrayIndex); },
    onPanResponderMove: (_, gs) => { onDragMove(gs.moveY); },
    onPanResponderRelease: () => { onDragEnd(); },
    onPanResponderTerminate: () => { onDragEnd(); },
  }), [arrayIndex, onDragStart, onDragMove, onDragEnd]);

  return (
    <TouchableOpacity
      onLayout={(e) => onLayout(arrayIndex, e.nativeEvent.layout.y)}
      style={[
        styles.queueItem,
        played && styles.queueItemPlayed,
        active && styles.queueItemActive,
        isDragSource && { opacity: 0.35 },
        isDragTarget && { borderTopWidth: 2, borderTopColor: colors.primary },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View {...gripPanResponder.panHandlers} style={{ paddingHorizontal: 6, paddingVertical: 10, cursor: "grab" } as any}>
        <FontAwesomeIcon icon={faGripVertical} size={18} color={active ? colors.primary : "#555555"} />
      </View>
      {item.cover ? (
        <Image source={{ uri: item.cover }} style={styles.queueThumbnail} />
      ) : (
        <View style={[styles.queueThumbnail, styles.queueThumbnailPlaceholder]}>
          <Text style={styles.queueThumbnailText} selectable={false}>♪</Text>
        </View>
      )}
      <View style={styles.queueTexts}>
        <Text style={[styles.queueTitle, active && styles.queueTitleActive]} numberOfLines={1} selectable={false}>
          {item.title || item.song}
        </Text>
        <Text style={styles.queueAuthor} numberOfLines={1} selectable={false}>
          {item.author || "Unbekannter Künstler"}
        </Text>
      </View>
      <Text style={[styles.queueDuration, active && { color: colors.primary }]} selectable={false}>
        {item.duration ? `${Math.round(item.duration / 60)}min` : ""}
      </Text>
    </TouchableOpacity>
  );
});

// ─── Player Screen ──────────────────────────────────────────────────────────
export default function PlayerScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const isMobile = !isDesktop;
  const windowHeight = Dimensions.get("window").height;
  
  const [meta, setMeta] = useState<StreamMeta | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState<number>(100);
  const [error, setError] = useState<string | null>(null);
  const [localElapsedTime, setLocalElapsedTime] = useState<number>(0);
  
  const volumeRef = useRef<number>(100);
  const isPlayingRef = useRef<boolean>(false);
  const metaRef = useRef<StreamMeta | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const nextSoundRef = useRef<Audio.Sound | null>(null);

  const setVolumeState = (v: number) => { volumeRef.current = v; setVolume(v); };
  const setIsPlayingState = (v: boolean) => { isPlayingRef.current = v; setIsPlaying(v); };
  const setMetaAndRef = (m: StreamMeta | null) => { metaRef.current = m; setMeta(m); };

  // ─── AUDIO MUTEX (DER iOS FIX) ──────────────────────────────────────────────
  const isAudioLockRef = useRef<boolean>(false);
  const pendingTrackRef = useRef<StreamMeta | null>(null);
  // ────────────────────────────────────────────────────────────────────────────

  const getEffectiveVolume = React.useCallback((m: StreamMeta | null = metaRef.current) => {
    const rawVolume = Number(volumeRef.current);
    const baseVol = Math.min(1, Math.max(0, (Number.isFinite(rawVolume) ? rawVolume : 100) / 100));
    if (!m?.monotoneEnabled || typeof m.lufsGainDb !== "number" || m.lufsGainDb === 0) return baseVol;
    const gainMult = Math.pow(10, m.lufsGainDb / 20);
    if (!Number.isFinite(gainMult) || gainMult <= 0) return baseVol;
    return Math.min(baseVol, Math.max(0, baseVol * gainMult));
  }, []);

  const applyCurrentVolume = React.useCallback(async (sound: Audio.Sound | null, m?: StreamMeta | null) => {
    if (!sound) return;
    await sound.setVolumeAsync(getEffectiveVolume(m ?? metaRef.current)).catch(() => undefined);
  }, [getEffectiveVolume]);

  const tokenRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metaVersionRef = useRef<number>(0);
  const localTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queueScrollRef = useRef<any>(null);
  const queueItemLayoutRef = useRef<Record<number, number>>({});
  const EST_QUEUE_ITEM_HEIGHT = 76;
  const lastMetaUpdateRef = useRef<number>(Date.now());
  const currentSongDurationRef = useRef<number>(0);
  const serverElapsedRef = useRef<number>(0);
  const serverTimestampRef = useRef<number>(Date.now());
  const pendingControlRef = useRef<boolean>(false);
  const lastLoadedTrackKeyRef = useRef<string>("");
  const hasStartedPlaybackRef = useRef<boolean>(false);

  // Drag State
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragToIdx, setDragToIdx] = useState<number | null>(null);
  const dragFromIdxRef = useRef<number | null>(null);
  const dragToIdxRef = useRef<number | null>(null);
  const queueScrollOffsetRef = useRef(0);
  const queueContainerTopRef = useRef(0);
  const dragStartHandlerRef = useRef<(idx: number) => void>(() => {});
  const dragMoveHandlerRef  = useRef<(moveY: number) => void>(() => {});
  const dragEndHandlerRef   = useRef<() => void>(() => {});
  const stableDragStart  = useCallback((idx: number) => { dragStartHandlerRef.current(idx); }, []);
  const stableDragMove   = useCallback((moveY: number) => { dragMoveHandlerRef.current(moveY); }, []);
  const stableDragEnd    = useCallback(() => { dragEndHandlerRef.current(); }, []);
  const stableOnLayout   = useCallback((idx: number, y: number) => { queueItemLayoutRef.current[idx] = y; }, []);

  // Bottom Sheet
  const COLLAPSED_HEIGHT = 220;
  const EXPANDED_HEIGHT = Math.round(windowHeight - 120);
  const sheetTranslateY = useRef(new Animated.Value(EXPANDED_HEIGHT - COLLAPSED_HEIGHT)).current;
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const panStartRef = useRef(0);

  const collapseSheet = () => Animated.spring(sheetTranslateY, { toValue: EXPANDED_HEIGHT - COLLAPSED_HEIGHT, useNativeDriver: true, friction: 8 }).start(() => setSheetExpanded(false));
  const expandSheet = () => Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }).start(() => setSheetExpanded(true));

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
    onPanResponderGrant: () => { panStartRef.current = (sheetTranslateY as any)._value || 0; },
    onPanResponderMove: (_, gestureState) => {
      const maxTranslate = Math.max(EXPANDED_HEIGHT - COLLAPSED_HEIGHT, 0);
      const next = Math.min(Math.max(panStartRef.current + gestureState.dy, 0), maxTranslate);
      sheetTranslateY.setValue(next);
    },
    onPanResponderRelease: (_, gestureState) => {
      const velocity = gestureState.vy;
      const maxTranslate = Math.max(EXPANDED_HEIGHT - COLLAPSED_HEIGHT, 0);
      const currentValue = (sheetTranslateY as any)._value || 0;
      if (currentValue < maxTranslate / 2 || velocity < -0.5) expandSheet();
      else collapseSheet();
    },
  }), [EXPANDED_HEIGHT, COLLAPSED_HEIGHT]);

  const updateServerTime = React.useCallback((elapsed: number, duration: number) => {
    const dur = Math.max(0, Number(duration) || 0);
    let el = Math.max(0, Number(elapsed) || 0);
    if (dur > 0) el = Math.min(el, dur);
    serverElapsedRef.current = el;
    serverTimestampRef.current = Date.now();
    currentSongDurationRef.current = dur;
    setLocalElapsedTime(Math.floor(el));
  }, []);

  const applyQueueFromServer = React.useCallback((serverQueue: any[], optMeta?: StreamMeta) => {
    if (!Array.isArray(serverQueue)) return;
    const m = optMeta ?? metaRef.current;
    let activeArrayIndex = -1;

    if (m) {
      if (m.filename) activeArrayIndex = serverQueue.findIndex((it: any) => it.song === m.filename);
      if (activeArrayIndex === -1 && typeof m.index === "number") activeArrayIndex = serverQueue.findIndex((it: any) => typeof it.index === "number" && it.index === m.index);
    }
    if (activeArrayIndex === -1) activeArrayIndex = serverQueue.findIndex((it: any) => Boolean(it.isPlaying));
    if (activeArrayIndex === -1) activeArrayIndex = 0;

    const mapped: QueueItem[] = serverQueue.map((it: any, arrIdx: number) => {
      const itemIndex = typeof it.index === "number" ? it.index : arrIdx;
      const matchesMeta = m ? (m.filename ? it.song === m.filename : (typeof m.index === "number" && itemIndex === m.index)) : false;
      const isPlaying = matchesMeta || (!m && arrIdx === activeArrayIndex);
      let hasBeenPlayed = false;
      
      if (typeof m?.index === "number") hasBeenPlayed = typeof itemIndex === "number" ? itemIndex < m.index : arrIdx < m.index;
      else hasBeenPlayed = arrIdx < activeArrayIndex;
      if (isPlaying) hasBeenPlayed = false;

      return {
        song: it.song, title: it.title, author: it.author, duration: it.duration,
        cover: it.cover, index: itemIndex, isPlaying: Boolean(isPlaying), hasBeenPlayed: Boolean(hasBeenPlayed),
      };
    });

    const firstActive = mapped.findIndex((x) => x.isPlaying);
    if (firstActive !== -1) {
      mapped.forEach((it, i) => (it.isPlaying = i === firstActive));
      mapped.forEach((it, i) => it.hasBeenPlayed = i === firstActive ? false : it.hasBeenPlayed);
    } else {
      mapped.forEach((it, i) => { it.isPlaying = i === 0; it.hasBeenPlayed = i === 0 ? false : true; });
    }

    setQueue(mapped);

    const activeIdx = mapped.findIndex((x) => x.isPlaying);
    if (activeIdx !== -1) {
      InteractionManager.runAfterInteractions(() => {
        const scrollView = queueScrollRef.current;
        if (!scrollView) return;
        const tryScroll = () => {
          const y = queueItemLayoutRef.current[activeIdx];
          if (typeof y === "number" && typeof scrollView.scrollTo === "function") {
            scrollView.scrollTo({ y: Math.max(y - 8, 0), animated: true });
            return true;
          }
          return false;
        };
        if (!tryScroll()) {
          let attempts = 0;
          const id = setInterval(() => { attempts += 1; if (tryScroll() || attempts > 12) clearInterval(id); }, 120);
        }
      });
    }
  }, []);

  // ─── CATCH-UP LOGIK ────────────────────────────────────────────────────────
  const handleStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if ((status as any).error) setError("Fehler beim Abspielen.");
      return;
    }
    setIsPlayingState(status.isPlaying);
    
    if (status.isPlaying && !pendingControlRef.current) {
      const now = Date.now();
      const timeSinceLastServerUpdate = (now - serverTimestampRef.current) / 1000;
      const currentServerElapsedSeconds = serverElapsedRef.current + timeSinceLastServerUpdate;
      const clientElapsedSeconds = status.positionMillis / 1000;
      const drift = currentServerElapsedSeconds - clientElapsedSeconds;

      if (drift > 3.5) {
        soundRef.current?.setPositionAsync(Math.floor(currentServerElapsedSeconds * 1000)).catch(() => {});
      } else if (drift > 0.8) {
        if (status.rate !== 1.1) soundRef.current?.setRateAsync(1.1, true).catch(() => {});
      } else if (drift < -0.5 || drift <= 0.2) {
        if (status.rate !== 1.0) soundRef.current?.setRateAsync(1.0, true).catch(() => {});
      }
    }

    if (status.didJustFinish) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.send("SONG_ENDED");
    }
  };

  // ─── SAFE AUDIO LOADER (MUTEX PATTERN) ──────────────────────────────────────
  const safeLoadTrack = async (targetMeta: StreamMeta) => {
    // 1. Wenn schon ein Prozess läuft, merken wir uns einfach den neuesten Track
    if (isAudioLockRef.current) {
      pendingTrackRef.current = targetMeta;
      return;
    }

    // 2. Lock aktivieren
    isAudioLockRef.current = true;
    setPlaybackLoading(true);

    try {
      let currentMetaToLoad: StreamMeta | null = targetMeta;

      // 3. Schleife, falls während des Ladens ein noch neuerer Track reinkam
      while (currentMetaToLoad) {
        if (!tokenRef.current || !currentMetaToLoad.filename) break;

        const trackKey = `${currentMetaToLoad.filename}:${typeof currentMetaToLoad.index === "number" ? currentMetaToLoad.index : ""}`;
        const fileUrl = `${API_BASE}/stream/file/${encodeURIComponent(currentMetaToLoad.filename)}?token=${encodeURIComponent(tokenRef.current)}`;

        // Wenn es derselbe Track ist, nur Volumen updaten
        if (soundRef.current && lastLoadedTrackKeyRef.current === trackKey) {
          await applyCurrentVolume(soundRef.current, currentMetaToLoad);
        } else {
          // Alten Sound sicher beenden, bevor der neue geladen wird
          if (soundRef.current) {
            await soundRef.current.unloadAsync().catch(() => undefined);
            soundRef.current = null;
          }

          // Neuen Sound laden
          const { sound } = await Audio.Sound.createAsync(
            { uri: fileUrl },
            {
              shouldPlay: true, // Autoplay
              positionMillis: (currentMetaToLoad.elapsed || 0) * 1000,
              progressUpdateIntervalMillis: 500,
              volume: getEffectiveVolume(currentMetaToLoad),
              rate: 1.0, // Catch-Up zurücksetzen
              shouldCorrectPitch: true
            }
          );

          soundRef.current = sound;
          lastLoadedTrackKeyRef.current = trackKey;
          sound.setOnPlaybackStatusUpdate(handleStatusUpdate);
          
          setIsPlayingState(true);
          setError(null);
          
          // Nächsten Song im Hintergrund preloaden (silent errors)
          preloadNextSong().catch(()=>undefined);
        }

        // 4. Wurde in der Zwischenzeit ein NOCH neuerer Track angefordert?
        currentMetaToLoad = pendingTrackRef.current;
        pendingTrackRef.current = null; // Zurücksetzen für den nächsten Durchlauf
      }
    } catch (err) {
      console.error("Audio Load Error:", err);
      setError("Song konnte nicht geladen werden.");
    } finally {
      // 5. Lock aufheben
      isAudioLockRef.current = false;
      setPlaybackLoading(false);
    }
  };

  const handleTrackChanged = React.useCallback((dm: any, serverQueue?: any[]) => {
    metaVersionRef.current += 1;
    const newElapsed = Number(dm.elapsed) || 0;
    const newDuration = Number(dm.duration) || 0;

    const freshMeta: StreamMeta = {
      filename: dm.filename, title: dm.title, author: dm.author, duration: newDuration,
      cover: dm.cover, index: dm.index, total: dm.total, elapsed: newElapsed,
      lufsGainDb: dm.lufsGainDb ?? 0, monotoneEnabled: dm.monotoneEnabled ?? false,
    };
    
    const shouldLoadAudio = Boolean(soundRef.current || hasStartedPlaybackRef.current);
    setMetaAndRef(freshMeta);
    updateServerTime(newElapsed, newDuration);
    setIsPlayingState(true);
    lastMetaUpdateRef.current = Date.now();

    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }
    pendingControlRef.current = false;

    // Nur laden, wenn Audio schon initiiert wurde
    if (shouldLoadAudio) {
      safeLoadTrack(freshMeta);
    }

    if (Array.isArray(serverQueue)) applyQueueFromServer(serverQueue, freshMeta);
    else if (queue.length > 0) applyQueueFromServer(queue, freshMeta);

    return metaVersionRef.current;
  }, [applyCurrentVolume, applyQueueFromServer, getEffectiveVolume, queue, updateServerTime]);

  // ────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      try {
        const stored = await AsyncStorage.getItem("authToken");
        if (!stored) { router.replace("/"); return; }
        tokenRef.current = stored;

        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true });

        await fetchMetadata();
        await fetchQueue();
        await loadVolume();
        setupWebSocket();
        await validateToken();

        authIntervalRef.current = setInterval(validateToken, 600000);
        syncIntervalRef.current = setInterval(syncCheck, 10000);
        
        localTimerRef.current = setInterval(() => {
          const now = Date.now();
          const timeSinceUpdate = (now - serverTimestampRef.current) / 1000;
          const calculatedElapsed = serverElapsedRef.current + timeSinceUpdate;
          const maxDuration = currentSongDurationRef.current;
          
          if (maxDuration > 0 && calculatedElapsed > maxDuration) setLocalElapsedTime(Math.floor(maxDuration));
          else setLocalElapsedTime(Math.floor(calculatedElapsed));
        }, 100);
        
        // Autoplay aktivieren
        if (metaRef.current) {
          hasStartedPlaybackRef.current = true;
          safeLoadTrack(metaRef.current);
        }

      } catch (err) { setError("Konnte Audio-Stream nicht starten."); } 
      finally { setLoading(false); }
    };

    init();

    return () => {
      if (localTimerRef.current) clearInterval(localTimerRef.current);
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (authIntervalRef.current) clearInterval(authIntervalRef.current);
      if (wsReconnectTimeoutRef.current) clearTimeout(wsReconnectTimeoutRef.current);
      if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);

      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (soundRef.current) { soundRef.current.unloadAsync().catch(() => undefined); soundRef.current = null; }
      if (nextSoundRef.current) { nextSoundRef.current.unloadAsync().catch(() => undefined); nextSoundRef.current = null; }
      
      hasStartedPlaybackRef.current = false;
      lastLoadedTrackKeyRef.current = "";
    };
  }, []);

  const setupWebSocket = () => {
    if (!tokenRef.current) return;
    if (wsReconnectTimeoutRef.current) clearTimeout(wsReconnectTimeoutRef.current);

    try {
      const ws = new WebSocket(WS_BASE + `/?token=${encodeURIComponent(tokenRef.current)}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.type === "trackChanged" && data.meta) handleTrackChanged(data.meta, Array.isArray(data.queue) ? data.queue : undefined);
          else if (data?.type === "queueUpdated" && data.queue) applyQueueFromServer(Array.isArray(data.queue?.queue) ? data.queue.queue : data.queue);
          else if (data?.type === "volumeChanged" && typeof data.volume === "number") {
            setVolumeState(Number(data.volume));
            applyCurrentVolume(soundRef.current);
          }
        } catch (e) {}
      };
      ws.onclose = () => { wsRef.current = null; wsReconnectTimeoutRef.current = setTimeout(setupWebSocket, 3000); };
    } catch { wsReconnectTimeoutRef.current = setTimeout(setupWebSocket, 5000); }
  };

  const loadVolume = async () => {
    if (!tokenRef.current) return;
    try {
      const res = await fetch(`${API_BASE}/stream/control/volume`, { headers: { Authorization: `Bearer ${tokenRef.current}` } });
      if (res.ok) { const json = await res.json(); if (typeof json?.volume === "number") setVolumeState(json.volume); }
    } catch (e) {}
  };

  const validateToken = async () => {
    if (!tokenRef.current) return;
    try {
      const res = await fetch(`${API_BASE}/auth/validate`, { method: "POST", headers: { Authorization: `Bearer ${tokenRef.current}`, "Content-Type": "application/json" } });
      if (res.status === 401) { await AsyncStorage.removeItem("authToken"); router.replace("/"); return; }
      if (res.ok) { const json = await res.json(); if (json?.token) { tokenRef.current = json.token; await AsyncStorage.setItem("authToken", json.token); } }
    } catch (e) {}
  };

  const syncCheck = async () => {
    if (!tokenRef.current || !meta) return;
    try {
      const beforeVer = metaVersionRef.current;
      const res = await fetch(`${API_BASE}/stream/meta/currentsong`, { headers: { Authorization: `Bearer ${tokenRef.current}` } });
      if (!res.ok) return;
      const json = await res.json();
      if (!json?.metadata) return;

      const sm = json.metadata;
      if (meta.filename !== sm.filename || meta.index !== sm.index) return;
      if (metaVersionRef.current !== beforeVer || pendingControlRef.current || Date.now() - (lastMetaUpdateRef.current || 0) < 1200) return;

      const diff = Math.abs((Number(sm.elapsed) || 0) - localElapsedTime);
      if (diff > 2) {
        updateServerTime(Number(sm.elapsed) || 0, Number(sm.duration) || 0);
        lastMetaUpdateRef.current = Date.now();
      }
    } catch (e) {}
  };

  const preloadNextSong = async () => {
    if (!tokenRef.current) return;
    try {
      const res = await fetch(`${API_BASE}/stream/prefetch`, { headers: { Authorization: `Bearer ${tokenRef.current}` } });
      if (!res.ok) return;
      const json = await res.json();
      if (!json?.next?.filename) return;

      if (nextSoundRef.current) await nextSoundRef.current.unloadAsync().catch(() => undefined);
      const { sound } = await Audio.Sound.createAsync({ uri: `${API_BASE}/stream/file/${encodeURIComponent(json.next.filename)}?token=${encodeURIComponent(tokenRef.current)}` }, { shouldPlay: false, volume: getEffectiveVolume(metaRef.current) });
      nextSoundRef.current = sound;
    } catch {}
  };

  const fetchMetadata = async (force = false) => {
    if (!tokenRef.current) return;
    try {
      const beforeVer = metaVersionRef.current;
      const res = await fetch(`${API_BASE}/stream/meta/currentsong`, { headers: { Authorization: `Bearer ${tokenRef.current}` } });
      if (res.status === 401) { await AsyncStorage.removeItem("authToken"); router.replace("/"); return; }
      if (!res.ok) return;
      const json = await res.json();
      if (json?.metadata && metaVersionRef.current === beforeVer) {
        if (pendingControlRef.current && !force) return;
        let elapsed = json.metadata.elapsed || 0;
        if (meta && meta.filename !== json.metadata.filename) elapsed = Math.min(1, elapsed);
        
        metaVersionRef.current += 1;
        const newMetaObj = { ...json.metadata, elapsed };
        setMetaAndRef(newMetaObj);
        updateServerTime(elapsed, json.metadata.duration || 0);
      }
    } catch (err) {}
  };

  const fetchQueue = async () => {
    if (!tokenRef.current) return;
    try {
      const beforeVer = metaVersionRef.current;
      const res = await fetch(`${API_BASE}/stream/meta/queue`, { headers: { Authorization: `Bearer ${tokenRef.current}` } });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.metadata) && metaVersionRef.current === beforeVer) applyQueueFromServer(json.metadata);
      }
    } catch (err) {}
  };

  const togglePlayPause = async () => {
    if (!soundRef.current) {
      if (metaRef.current) {
        hasStartedPlaybackRef.current = true;
        safeLoadTrack(metaRef.current);
      }
      return;
    }
    const status = await soundRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) await soundRef.current.pauseAsync();
    else {
      const elapsed = serverElapsedRef.current + (Date.now() - serverTimestampRef.current) / 1000;
      try { await soundRef.current.setPositionAsync(Math.max(0, Math.floor((currentSongDurationRef.current > 0 ? Math.min(elapsed, currentSongDurationRef.current) : elapsed) * 1000))); } catch {}
      await soundRef.current.playAsync();
    }
  };

  const callControl = async (path: string) => {
    if (!tokenRef.current) return;
    try {
      await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${tokenRef.current}` } });
      if (path.includes('/skip') || path.includes('/previous') || path.includes('/jumpto')) {
        if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
        pendingControlRef.current = true;
        serverElapsedRef.current = 0;
        serverTimestampRef.current = Date.now();
        setLocalElapsedTime(0);
        const prevMetaTs = lastMetaUpdateRef.current;
        fallbackTimeoutRef.current = setTimeout(async () => {
          if (lastMetaUpdateRef.current <= prevMetaTs) { await fetchMetadata(true); await fetchQueue(); }
        }, 1500);
      }
    } catch (err) { Alert.alert("Fehler", "Steuerbefehl konnte nicht gesendet werden."); }
  };

  const changeVolume = async (delta: number) => {
    const newV = Math.max(0, Math.min(200, Math.round((volumeRef.current || 0) + delta)));
    setVolumeState(newV);
    applyCurrentVolume(soundRef.current);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.send(`VOLUME:${newV}`);
    else if (tokenRef.current) fetch(`${API_BASE}/stream/control/sound/${newV}`, { headers: { Authorization: `Bearer ${tokenRef.current}` } }).catch(() => undefined);
  };

  const logout = async () => { await AsyncStorage.removeItem("authToken"); router.replace("/"); };

  const moveInQueue = async (from: number, to: number) => {
    if (from === to || !tokenRef.current) return;
    setQueue(prev => {
      const q = [...prev];
      q.splice(to, 0, q.splice(from, 1)[0]);
      const activeIdx = q.findIndex(x => x.isPlaying);
      return q.map((it, i) => ({ ...it, index: i, isPlaying: i === activeIdx, hasBeenPlayed: i < activeIdx }));
    });
    try { await fetch(`${API_BASE}/stream/control/move/${from}/${to}`, { headers: { Authorization: `Bearer ${tokenRef.current}` } }); } catch {}
  };

  dragStartHandlerRef.current = (idx: number) => {
    if (queueScrollRef.current && typeof (queueScrollRef.current as any).measureInWindow === "function") {
      (queueScrollRef.current as any).measureInWindow((_x: number, y: number) => { queueContainerTopRef.current = y; });
    }
    dragFromIdxRef.current = idx; dragToIdxRef.current = idx;
    setDragFromIdx(idx); setDragToIdx(idx);
  };

  dragMoveHandlerRef.current = (moveY: number) => {
    if (dragFromIdxRef.current === null) return;
    const relY = moveY - queueContainerTopRef.current + queueScrollOffsetRef.current;
    const positions = queueItemLayoutRef.current;
    const keys = Object.keys(positions).map(Number).sort((a, b) => a - b);
    if (keys.length === 0) return;
    let targetIdx = keys[keys.length - 1];
    for (const k of keys) { if (relY < (positions[k] ?? 0) + EST_QUEUE_ITEM_HEIGHT / 2) { targetIdx = k; break; } }
    if (targetIdx !== dragToIdxRef.current) { dragToIdxRef.current = targetIdx; setDragToIdx(targetIdx); }
  };

  dragEndHandlerRef.current = () => {
    const from = dragFromIdxRef.current; const to = dragToIdxRef.current;
    dragFromIdxRef.current = null; dragToIdxRef.current = null;
    setDragFromIdx(null); setDragToIdx(null);
    if (from !== null && to !== null && from !== to) moveInQueue(from, to);
  };

  const progress = (() => {
    const duration = meta?.duration ?? currentSongDurationRef.current ?? 0;
    if (!duration) return 0;
    return Math.min(1, Math.max(0, Math.max(0, localElapsedTime || 0) / duration));
  })();

  const elapsedSeconds = localElapsedTime;
  const durationSeconds = meta?.duration ?? currentSongDurationRef.current ?? 0;
  const remainingSeconds = Math.max(0, durationSeconds - elapsedSeconds);

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText} selectable={false}>Player wird geladen…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.headerRow, isDesktop && styles.headerRowDesktop]}>
        <Text style={styles.headerTitle} selectable={false}>MetaWave</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.headerIcon} onPress={() => { if (Platform.OS === "web") { window.location.reload(); } else { router.replace("/player"); } }}>
            <Ionicons name="refresh-outline" size={18} color="#737373" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={() => router.push("/settings" as any)}>
            <Ionicons name="settings-outline" size={18} color="#737373" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={logout}>
            <Ionicons name="log-out-outline" size={18} color="#FF6B6B" />
          </TouchableOpacity>
        </View>
      </View>

      {isMobile ? (
        <View style={[styles.centerContent, { paddingBottom: COLLAPSED_HEIGHT + 16 }]}>
          <View style={[styles.playerColumn]}>
          {meta?.cover ? (
            <Image source={{ uri: meta.cover }} style={styles.cover} />
          ) : (
            <View style={[styles.cover, styles.coverPlaceholder]}>
              <Text style={styles.coverPlaceholderText} selectable={false}>MetaWave</Text>
            </View>
          )}

          <View style={styles.metaBlock}>
            <Text style={styles.songTitle} selectable={false}>{meta?.title || "Unbekannter Titel"}</Text>
            <Text style={styles.songAuthor} selectable={false}>{meta?.author || "Unbekannter Künstler"}</Text>
            {meta?.index !== undefined && meta?.total !== undefined && ( <Text style={styles.queueText} selectable={false}>{meta.index + 1} / {meta.total}</Text> )}
          </View>

          <View style={styles.progressBarWrapper}>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { flex: progress }]} />
              <View style={{ flex: 1 - progress }} />
            </View>
            <View style={styles.progressLabelRow}>
              <View style={styles.progressLeftBlock}>
                <Text style={styles.progressLabel} selectable={false}>{formatTime(elapsedSeconds)}</Text>
                <Text style={styles.volumeText} selectable={false}>{volume}% Lautstärke</Text>
              </View>
              <View style={styles.progressRightBlock}>
                <Text style={styles.progressLabel} selectable={false}>-{formatTime(remainingSeconds)}</Text>
                {remainingSeconds > 0 && ( <Text style={styles.progressEndLabel} selectable={false}>Endet um: {formatEndClockTime(remainingSeconds)}</Text> )}
              </View>
            </View>
          </View>

          {error && <Text style={styles.errorText} selectable={false}>{error}</Text>}

          <View style={styles.controlsRowMain}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => callControl("/stream/control/previous")}>
              <FontAwesomeIcon icon={faBackwardStep} size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.playButton} onPress={togglePlayPause} disabled={playbackLoading}>
              {playbackLoading ? ( <ActivityIndicator color="#fff" /> ) : ( <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} size={24} color="#FFFFFF" /> )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={() => callControl("/stream/control/skip")}>
              <FontAwesomeIcon icon={faForwardStep} size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.controlsRowSecondary}>
            <TouchableOpacity style={styles.chip} onPress={() => changeVolume(-10)}>
              <Text style={styles.chipText} selectable={false}>-10%</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={() => callControl("/stream/control/shuffle")}>
              <Text style={styles.chipText} selectable={false}>Shuffle</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={() => changeVolume(10)}>
              <Text style={styles.chipText} selectable={false}>+10%</Text>
            </TouchableOpacity>
          </View>
          </View>

          <Animated.View style={[ styles.bottomSheet, { height: EXPANDED_HEIGHT, transform: [{ translateY: sheetTranslateY }] } ]}>
            <View {...panResponder.panHandlers} style={styles.sheetHandleTouchArea}>
              <View style={styles.sheetHandle} />
            </View>
            <Text style={styles.queueHeader} selectable={false}>Queue</Text>
            <ScrollView
              ref={queueScrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 40 }}
              showsVerticalScrollIndicator
              scrollEnabled={dragFromIdx === null}
              onScroll={(e) => { queueScrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
              scrollEventThrottle={16}
            >
              <View style={{ paddingBottom: 24 }}>
                {queue.map((item, arrayIndex) => (
                  <QueueItemRow
                    key={`${item.index}-${item.song}`} item={item} arrayIndex={arrayIndex}
                    active={item.isPlaying} played={Boolean(item.hasBeenPlayed) && !item.isPlaying}
                    isDragSource={dragFromIdx === arrayIndex} isDragTarget={dragToIdx === arrayIndex && dragFromIdx !== null && dragFromIdx !== arrayIndex}
                    onLayout={stableOnLayout} onPress={() => { callControl(`/stream/control/jumpto/${item.index}`); collapseSheet(); }}
                    onDragStart={stableDragStart} onDragMove={stableDragMove} onDragEnd={stableDragEnd}
                  />
                ))}
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.centerContent, isDesktop && styles.centerContentDesktop]} showsVerticalScrollIndicator={false}>
          <View style={[styles.playerColumn, isDesktop && styles.playerColumnDesktop]}>
            {meta?.cover ? (
              <Image source={{ uri: meta.cover }} style={[styles.cover, isDesktop && styles.coverDesktop]} />
            ) : (
              <View style={[styles.cover, isDesktop && styles.coverDesktop, styles.coverPlaceholder]}>
                <Text style={styles.coverPlaceholderText}>MetaWave</Text>
              </View>
            )}

            <View style={styles.metaBlock}>
              <Text style={[styles.songTitle, isDesktop && styles.songTitleDesktop]} selectable={false}>{meta?.title || "Unbekannter Titel"}</Text>
              <Text style={[styles.songAuthor, isDesktop && styles.songAuthorDesktop]} selectable={false}>{meta?.author || "Unbekannter Künstler"}</Text>
              {meta?.index !== undefined && meta?.total !== undefined && ( <Text style={styles.queueText} selectable={false}>{meta.index + 1} / {meta.total}</Text> )}
            </View>

            <View style={styles.progressBarWrapper}>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { flex: progress }]} />
                <View style={{ flex: 1 - progress }} />
              </View>
              <View style={styles.progressLabelRow}>
                <View style={styles.progressLeftBlock}>
                  <Text style={[styles.progressLabel, isDesktop && styles.progressLabelDesktop]} selectable={false}>{formatTime(elapsedSeconds)}</Text>
                  <Text style={[styles.volumeText, isDesktop && styles.volumeTextDesktop]} selectable={false}>{volume}% Lautstärke</Text>
                </View>
                <View style={styles.progressRightBlock}>
                  <Text style={[styles.progressLabel, isDesktop && styles.progressLabelDesktop]} selectable={false}>-{formatTime(remainingSeconds)}</Text>
                  {remainingSeconds > 0 && ( <Text style={[styles.progressEndLabel, isDesktop && styles.progressEndLabelDesktop]} selectable={false}>Endet um: {formatEndClockTime(remainingSeconds)}</Text> )}
                </View>
              </View>
            </View>

            {error && <Text style={styles.errorText} selectable={false}>{error}</Text>}

            <View style={styles.controlsRowMain}>
              <TouchableOpacity style={[styles.secondaryButton, isDesktop && styles.secondaryButtonDesktop]} onPress={() => callControl("/stream/control/previous")}>
                <FontAwesomeIcon icon={faBackwardStep} size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.playButton, isDesktop && styles.playButtonDesktop]} onPress={togglePlayPause} disabled={playbackLoading}>
                {playbackLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} size={26} color="#FFFFFF" />
                )}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaryButton, isDesktop && styles.secondaryButtonDesktop]} onPress={() => callControl("/stream/control/skip")}>
                <FontAwesomeIcon icon={faForwardStep} size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.controlsRowSecondary}>
              <TouchableOpacity style={styles.chip} onPress={() => changeVolume(-10)}>
                <Text style={styles.chipText} selectable={false}>-10%</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.chip} onPress={() => callControl("/stream/control/shuffle")}>
                <Text style={styles.chipText} selectable={false}>Shuffle</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.chip} onPress={() => changeVolume(10)}>
                <Text style={styles.chipText} selectable={false}>+10%</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.queueContainer, isDesktop && styles.queueContainerDesktop]}>
            {isDesktop && <View style={styles.queueHandleDesktop} />}
            <Text style={styles.queueHeader} selectable={false}>Queue</Text>
            <ScrollView
              ref={queueScrollRef}
              style={[styles.queueListContent, { flex: 1 }]}
              contentContainerStyle={{ paddingBottom: 24 }}
              showsVerticalScrollIndicator
              scrollEnabled={dragFromIdx === null}
              onScroll={(e) => {
                queueScrollOffsetRef.current = e.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
              {...(Platform.OS === "web"
                ? ({ className: "queue-scroll" } as any)
                : {})}
            >
              <View style={{ flex: 1 }}>
                {queue.map((item, arrayIndex) => (
                  <QueueItemRow
                    key={`${item.index}-${item.song}`} item={item} arrayIndex={arrayIndex}
                    active={item.isPlaying} played={Boolean(item.hasBeenPlayed) && !item.isPlaying}
                    isDragSource={dragFromIdx === arrayIndex} isDragTarget={dragToIdx === arrayIndex && dragFromIdx !== null && dragFromIdx !== arrayIndex}
                    onLayout={stableOnLayout} onPress={() => callControl(`/stream/control/jumpto/${item.index}`)}
                    onDragStart={stableDragStart} onDragMove={stableDragMove} onDragEnd={stableDragEnd}
                  />
                ))}
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      )}

      {isDesktop && (
        <View style={[styles.footer, styles.footerDesktop]}>
          <View style={styles.footerLeft}>
            <TouchableOpacity onPress={() => router.push("/impressum" as any)}>
              <Text style={styles.footerLink}>Impressum</Text>
            </TouchableOpacity>
            <Text style={styles.footerDivider}>/</Text>
            <TouchableOpacity onPress={() => router.push("/datenschutz" as any)}>
              <Text style={styles.footerLink}>Datenschutz</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.footerVersion}>v4.0.0</Text>
        </View>
      )}
    </SafeAreaView>
  );
}