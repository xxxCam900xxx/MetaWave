import React, { useEffect, useRef, useState, useMemo } from "react";
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
  const soundRef = useRef<Audio.Sound | null>(null);
  const tokenRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metaVersionRef = useRef<number>(0); // incremented on every authoritative meta update
  const localTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queueScrollRef = useRef<any>(null);
  const queueItemLayoutRef = useRef<Record<number, number>>({});
  const EST_QUEUE_ITEM_HEIGHT = 76; // estimated height for fallback scrolling
  const volumeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMetaUpdateRef = useRef<number>(Date.now());
  const currentSongDurationRef = useRef<number>(0);
  const serverElapsedRef = useRef<number>(0);  // Letzte elapsed time vom Server
  const serverTimestampRef = useRef<number>(Date.now());  // Zeitpunkt des letzten Updates
  const pendingControlRef = useRef<boolean>(false);

  // Bottom sheet (mobile) state
  const COLLAPSED_HEIGHT = 220; // Show 2-3 songs
  const EXPANDED_HEIGHT = Math.round(windowHeight - 120); // Almost full screen (leave larger margin)
  const sheetTranslateY = useRef(new Animated.Value(EXPANDED_HEIGHT - COLLAPSED_HEIGHT)).current;
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const panStartRef = useRef(0);

  // Collapse the sheet back to minimized state
  const collapseSheet = () => {
    Animated.spring(sheetTranslateY, { 
      toValue: EXPANDED_HEIGHT - COLLAPSED_HEIGHT, 
      useNativeDriver: true,
      friction: 8,
    }).start(() => {
      setSheetExpanded(false);
    });
  };

  // Expand the sheet
  const expandSheet = () => {
    Animated.spring(sheetTranslateY, { 
      toValue: 0, 
      useNativeDriver: true,
      friction: 8,
    }).start(() => {
      setSheetExpanded(true);
    });
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      return Math.abs(gestureState.dy) > 5;
    },
    onPanResponderGrant: () => {
      // @ts-ignore - _value exists at runtime
      panStartRef.current = sheetTranslateY._value || 0;
    },
    onPanResponderMove: (_, gestureState) => {
      const maxTranslate = Math.max(EXPANDED_HEIGHT - COLLAPSED_HEIGHT, 0);
      const next = Math.min(Math.max(panStartRef.current + gestureState.dy, 0), maxTranslate);
      sheetTranslateY.setValue(next);
    },
    onPanResponderRelease: (_, gestureState) => {
      const velocity = gestureState.vy;
      const maxTranslate = Math.max(EXPANDED_HEIGHT - COLLAPSED_HEIGHT, 0);
      // @ts-ignore
      const currentValue = sheetTranslateY._value || 0;
      const threshold = maxTranslate / 2;
      
      // Expand if dragged past threshold or flicked up fast
      const shouldExpand = currentValue < threshold || velocity < -0.5;
      
      if (shouldExpand) {
        expandSheet();
      } else {
        collapseSheet();
      }
    },
  }), [EXPANDED_HEIGHT, COLLAPSED_HEIGHT]);

  // Helper: Server-Zeit speichern - Timer berechnet sich daraus automatisch
  // Clamp values to avoid negative / overshoot and ensure UI shows integer seconds.
  const updateServerTime = React.useCallback((elapsed: number, duration: number) => {
    const dur = Math.max(0, Number(duration) || 0);
    let el = Math.max(0, Number(elapsed) || 0);
    if (dur > 0) el = Math.min(el, dur);

    console.log(`[Timer] Applying server time: ${el}s / ${dur}s`);

    serverElapsedRef.current = el;
    serverTimestampRef.current = Date.now();
    currentSongDurationRef.current = dur;
    // Force UI update with integer seconds
    setLocalElapsedTime(Math.floor(el));
  }, []);

  // Apply a queue coming from the server. Deterministically derive `isPlaying`
  // and `hasBeenPlayed` from authoritative `meta` and the server queue only.
  const applyQueueFromServer = React.useCallback((serverQueue: any[], optMeta?: StreamMeta) => {
    if (!Array.isArray(serverQueue)) return;

    const m = optMeta ?? meta;

    // Determine authoritative active array index:
    // Priority: match by meta.filename, then by meta.index, then by server-provided isPlaying, else fallback to first item.
    let activeArrayIndex = -1;

    if (m) {
      if (m.filename) {
        activeArrayIndex = serverQueue.findIndex((it: any) => it.song === m.filename);
      }
      if (activeArrayIndex === -1 && typeof m.index === "number") {
        activeArrayIndex = serverQueue.findIndex((it: any) => typeof it.index === "number" && it.index === m.index);
      }
    }

    if (activeArrayIndex === -1) {
      activeArrayIndex = serverQueue.findIndex((it: any) => Boolean(it.isPlaying));
    }
    if (activeArrayIndex === -1) {
      activeArrayIndex = 0; // deterministic fallback
    }

    // Build new queue solely from serverQueue + authoritative meta (no previous state influences)
    const mapped: QueueItem[] = serverQueue.map((it: any, arrIdx: number) => {
      const itemIndex = typeof it.index === "number" ? it.index : arrIdx;

      // isPlaying derived deterministically from meta (if present) or activeArrayIndex
      const matchesMeta = m && ((m.filename && it.song === m.filename) || (typeof m.index === "number" && itemIndex === m.index));
      const isPlaying = Boolean(matchesMeta) || (!m && arrIdx === activeArrayIndex) || (m && arrIdx === activeArrayIndex && activeArrayIndex !== -1 && !matchesMeta);

      // hasBeenPlayed derived strictly from meta.index if available, otherwise by position vs activeArrayIndex
      let hasBeenPlayed = false;
      if (typeof m?.index === "number") {
        hasBeenPlayed = typeof itemIndex === "number" ? itemIndex < m.index : arrIdx < m.index;
      } else {
        hasBeenPlayed = arrIdx < activeArrayIndex;
      }

      // Active item must never be considered played
      if (isPlaying) hasBeenPlayed = false;

      return {
        song: it.song,
        title: it.title,
        author: it.author,
        duration: it.duration,
        cover: it.cover,
        index: itemIndex,
        isPlaying: Boolean(isPlaying),
        hasBeenPlayed: Boolean(hasBeenPlayed),
      };
    });

    // Ensure exactly one active item (enforce single active deterministically)
    const firstActive = mapped.findIndex((x) => x.isPlaying);
    if (firstActive !== -1) {
      mapped.forEach((it, i) => (it.isPlaying = i === firstActive));
      mapped.forEach((it, i) => {
        it.hasBeenPlayed = i === firstActive ? false : it.hasBeenPlayed;
      });
    } else {
      // guaranteed fallback: mark index 0 active
      mapped.forEach((it, i) => {
        it.isPlaying = i === 0;
        it.hasBeenPlayed = i === 0 ? false : true;
      });
    }

    setQueue(mapped);

    // After queue is applied, attempt to scroll the active item into view.
    const activeIdx = mapped.findIndex((x) => x.isPlaying);
    if (activeIdx !== -1) {
      InteractionManager.runAfterInteractions(() => {
        const scrollView = queueScrollRef.current;
        if (!scrollView) return;

        const tryScroll = () => {
          const y = queueItemLayoutRef.current[activeIdx];
          console.log(`[Scroll] attempt for index=${activeIdx} layoutY=${y}`);
          if (typeof y === "number" && typeof scrollView.scrollTo === "function") {
            scrollView.scrollTo({ y: Math.max(y - 8, 0), animated: true });
            return true;
          }

          // fallback: estimate position based on average item height
          if (typeof scrollView.scrollTo === "function") {
            const est = Math.max(activeIdx * EST_QUEUE_ITEM_HEIGHT - 8, 0);
            console.log(`[Scroll] falling back to estimate y=${est}`);
            scrollView.scrollTo({ y: est, animated: true });
            return true;
          }
          return false;
        };

        if (!tryScroll()) {
          let attempts = 0;
          const id = setInterval(() => {
            attempts += 1;
            if (tryScroll() || attempts > 12) clearInterval(id);
          }, 120);
        }
      });
    }
  }, [meta]);

  // Centralized handler for authoritative track changes (from WS or fallback HTTP)
  const handleTrackChanged = React.useCallback((dm: any, serverQueue?: any[]) => {
    // bump version so in-flight HTTP responses can detect staleness
    metaVersionRef.current += 1;
    const newVer = metaVersionRef.current;

    const newElapsed = Number(dm.elapsed) || 0;
    const newDuration = Number(dm.duration) || 0;

    const freshMeta: StreamMeta = {
      filename: dm.filename,
      title: dm.title,
      author: dm.author,
      duration: newDuration,
      cover: dm.cover,
      index: dm.index,
      total: dm.total,
      elapsed: newElapsed,
    };

    // Set meta atomically
    setMeta(freshMeta);

    // Timer and play state — update via centralized helper to avoid partial updates/flicker
    updateServerTime(newElapsed, newDuration);
    setIsPlaying(true);

    // record last update time for fallback/sync checks immediately so syncCheck won't override
    lastMetaUpdateRef.current = Date.now();

    // cancel any fallback because WS provided authoritative data
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }

    // clear any pending control optimistic state
    pendingControlRef.current = false;

    // If the server already included the queue, apply it deterministically
    if (Array.isArray(serverQueue)) {
      applyQueueFromServer(serverQueue, freshMeta);
    } else {
      // If we already have a queue locally, reconcile its isPlaying with the new meta
      if (queue.length > 0) {
        applyQueueFromServer(queue, freshMeta);
      }
    }

    return newVer;
  }, [applyQueueFromServer, queue]);

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

        // Do not auto-start audio on navigation. User must press Play.
        // Initial Metadata & Queue laden
        await fetchMetadata();
        await fetchQueue();
        await loadVolume();
        setupWebSocket();
        await validateToken();

        // Kein HTTP-Polling mehr! WebSocket liefert alle Updates in Echtzeit
        // Nur Auth-Token alle 10 Minuten refreshen
        authIntervalRef.current = setInterval(validateToken, 600000);
        
        // Sync-Check alle 10 Sekunden - korrigiert Timer-Drift ohne Performance-Verlust
        syncIntervalRef.current = setInterval(syncCheck, 10000);
        
        // EIN einziger Timer - berechnet elapsed time basierend auf Server-Zeit + lokaler Zeitdifferenz
        localTimerRef.current = setInterval(() => {
          const now = Date.now();
          const timeSinceUpdate = (now - serverTimestampRef.current) / 1000;  // In Sekunden
          const calculatedElapsed = serverElapsedRef.current + timeSinceUpdate;
          const maxDuration = currentSongDurationRef.current;
          
          // Begrenzen auf Song-Duration (immer ganze Sekunden)
            if (maxDuration > 0 && calculatedElapsed > maxDuration) {
              setLocalElapsedTime(Math.floor(maxDuration));
            } else {
              setLocalElapsedTime(Math.floor(calculatedElapsed));
            }
        }, 100);  // 10x pro Sekunde für smoothness
        
        console.log(`[Init] Started calculation-based timer`);
      } catch (err) {
        setError("Konnte Audio-Stream nicht starten.");
      } finally {
        setLoading(false);
      }
    };

    init();

    return () => {
      if (localTimerRef.current) {
        clearInterval(localTimerRef.current);
        localTimerRef.current = null;
      }

      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }

      if (authIntervalRef.current) {
        clearInterval(authIntervalRef.current);
        authIntervalRef.current = null;
      }

      if (wsReconnectTimeoutRef.current) {
        clearTimeout(wsReconnectTimeoutRef.current);
        wsReconnectTimeoutRef.current = null;
      }

      if (volumeDebounceRef.current) {
        clearTimeout(volumeDebounceRef.current);
        volumeDebounceRef.current = null;
      }

      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
        fallbackTimeoutRef.current = null;
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

    // Clear any pending reconnect
    if (wsReconnectTimeoutRef.current) {
      clearTimeout(wsReconnectTimeoutRef.current);
      wsReconnectTimeoutRef.current = null;
    }

    try {
      const wsUrl = WS_BASE + `/?token=${encodeURIComponent(tokenRef.current)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket verbunden");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data?.type === "trackChanged" && data.meta) {
            // WS provides authoritative meta; it may optionally include the queue
            const dm = data.meta as any;
            const serverQueue = Array.isArray(data.queue) ? data.queue : undefined;
            handleTrackChanged(dm, serverQueue);
            return;
          }

          if (data?.type === "queueUpdated" && data.queue) {
            const q = Array.isArray(data.queue?.queue) ? data.queue.queue : data.queue;
            applyQueueFromServer(q);
            return;
          }

          if (data?.type === "volumeChanged" && typeof data.volume === "number") {
            setVolume(Number(data.volume));
            return;
          }
        } catch (e) {
          // Ignore malformed messages
        }
      };

      ws.onerror = () => {
        console.log("WebSocket Fehler");
      };

      ws.onclose = () => {
        console.log("WebSocket geschlossen, versuche Reconnect in 3s...");
        wsRef.current = null;
        // Auto-Reconnect nach 3 Sekunden
        wsReconnectTimeoutRef.current = setTimeout(() => {
          setupWebSocket();
        }, 3000);
      };
    } catch {
      // Wenn WS gar nicht erreichbar ist, versuche erneut nach 5s
      wsReconnectTimeoutRef.current = setTimeout(() => {
        setupWebSocket();
      }, 5000);
    }
  };

  useEffect(() => {
    const scrollView = queueScrollRef.current;
    if (!scrollView) return;
    const activeArrayIndex = queue.findIndex((item) => item.isPlaying);
    if (activeArrayIndex === -1) return;

    const scrollToActive = () => {
      const y = queueItemLayoutRef.current[activeArrayIndex];
      if (typeof y === "number" && typeof scrollView.scrollTo === "function") {
        // scroll so the active item sits at the very top (small offset)
        scrollView.scrollTo({ y: Math.max(y - 8, 0), animated: true });
        return true;
      }
      return false;
    };

    // Wait for interactions/layout to finish, then try scrolling and retry longer
    InteractionManager.runAfterInteractions(() => {
      if (scrollToActive()) return;

      let attempts = 0;
      const id = setInterval(() => {
        attempts += 1;
        if (scrollToActive() || attempts > 20) {
          clearInterval(id);
        }
      }, 120);
    });
  }, [queue, meta?.filename]);

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

  // Sync-Check: Prüft alle 10s ob lokaler Timer mit Server synchron ist
  // Only correct drift when the server response matches the currently active song
  // (both filename AND index must match). Never overwrite a newer WS `trackChanged`.
  const syncCheck = async () => {
    if (!tokenRef.current || !meta) return;

    try {
      const beforeVer = metaVersionRef.current;
      const res = await fetch(`${API_BASE}/stream/meta/currentsong`, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });

      if (!res.ok) return;

      const json = await res.json();
      if (!json?.metadata) return;

      const sm = json.metadata;
      const serverFilename = sm.filename;
      const serverIndex = sm.index;
      const serverElapsed = Number(sm.elapsed) || 0;
      const serverDuration = Number(sm.duration) || 0;

      // Require both filename AND index to match the currently active meta.
      // If either is missing or differs, ignore the response entirely.
      const filenameMatches = meta.filename && serverFilename && meta.filename === serverFilename;
      const indexMatches = typeof meta.index === 'number' && typeof serverIndex === 'number' && meta.index === serverIndex;

      if (!filenameMatches || !indexMatches) {
        // Different song (or insufficient identifying info) — do not touch timer or meta
        return;
      }

      // If a newer authoritative WS update arrived while we fetched, skip applying this HTTP result
      if (metaVersionRef.current !== beforeVer) {
        console.log('[Sync] Skipping sync because a newer WS update exists');
        return;
      }

      // If an authoritative trackChanged arrived very recently, or we're awaiting one
      // because of a user control, avoid racing with it.
      // This prevents syncCheck (HTTP) from briefly overwriting the fresh WS update.
      if (pendingControlRef.current || Date.now() - (lastMetaUpdateRef.current || 0) < 1200) {
        // recent authoritative update or pending control — skip correction
        console.log('[Sync] Skipping sync because a recent authoritative update or pending control exists');
        return;
      }

      const currentLocal = localElapsedTime;
      const diff = Math.abs(serverElapsed - currentLocal);

      // Only correct for significant drift (>2s)
      if (diff > 2) {
        console.log(`[Sync] Correcting drift ${diff}s for ${serverFilename}#${serverIndex} (Local: ${currentLocal}s, Server: ${serverElapsed}s)`);

        // Apply server time, but do NOT increment metaVersionRef — this is a correction, not a new authoritative meta.
        updateServerTime(serverElapsed, serverDuration || 0);
        lastMetaUpdateRef.current = Date.now();
      }
    } catch (e) {
      // Ignore sync errors
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

  // Start or prepare the audio stream. Pass `shouldPlay=true` to immediately start playback.
  const startStream = async (shouldPlay = false) => {
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
        { shouldPlay }
      );

      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate(handleStatusUpdate);
      setError(null);
      // Fetch latest metadata right after creating the sound so the UI timer
      // is immediately synced to the current stream position (important when
      // the user starts playback mid-song).
      try {
        await fetchMetadata();
      } catch (e) {
        // ignore fetch errors here; fetchMetadata already handles them
      }

      if (!shouldPlay) {
        const st = await sound.getStatusAsync();
        if (st.isLoaded && st.isPlaying) {
          await sound.pauseAsync();
        }
      }
    } catch (err) {
      setError("Audio-Stream konnte nicht geladen werden.");
    } finally {
      setPlaybackLoading(false);
    }
  };

  const fetchMetadata = async (force = false) => {
    if (!tokenRef.current) return;
    try {
      const beforeVer = metaVersionRef.current;
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
      if (json?.metadata) {
        // If a newer WS update arrived while we were fetching, skip applying this HTTP result
        if (metaVersionRef.current !== beforeVer) {
          console.log('[HTTP] Stale metadata response ignored due to newer WS update');
          return;
        }

        const newMeta = json.metadata;
        const elapsed = newMeta.elapsed || 0;
        const duration = newMeta.duration || 0;

        // If a control is pending and this isn't a forced fallback, ignore the response.
        if (pendingControlRef.current && !force) {
          console.log('[HTTP] Ignoring metadata while control pending (not forced)');
          return;
        }

        // If we are awaiting an authoritative trackChanged due to a user control,
        // and the fallback still returns the previous song (same filename/index),
        // ignore it — the server hasn't switched yet and applying it would overwrite
        // our optimistic reset. If forced, allow applying regardless.
        if (!force && pendingControlRef.current && meta) {
          const respFilename = newMeta.filename;
          const respIndex = newMeta.index;
          if (respFilename === meta.filename && typeof respIndex === 'number' && respIndex === meta.index) {
            console.log('[HTTP] Fallback returned same song while awaiting WS — ignoring to avoid overwrite');
            return;
          }
        }

        console.log(`[HTTP] Metadata fetched (fallback): "${newMeta.title}" - Elapsed: ${elapsed}s / Duration: ${duration}s`);

        // If the filename changed compared to current meta, prefer a reset so the
        // UI doesn't continue showing the previous song's elapsed.
        let elapsedToApply = elapsed;
        if (meta && newMeta.filename && meta.filename !== newMeta.filename) {
          // New song detected — reset elapsed to 0 (or keep tiny offsets <=1s)
          elapsedToApply = Math.min(1, elapsedToApply);
          console.log('[HTTP] Detected filename change — resetting elapsed to', elapsedToApply);
        }

        // Mark this HTTP response as applied
        metaVersionRef.current += 1;

        setMeta({
          filename: newMeta.filename,
          title: newMeta.title,
          author: newMeta.author,
          duration: duration,
          cover: newMeta.cover,
          index: newMeta.index,
          total: newMeta.total,
          elapsed: elapsedToApply
        });
        // Apply server time (clamped) — use the adjusted elapsed for filename changes
        updateServerTime(elapsedToApply, duration);
      }
    } catch (err) {
      // Ignore polling errors briefly
    }
  };

  const fetchQueue = async () => {
    if (!tokenRef.current) return;

    try {
      const beforeVer = metaVersionRef.current;
      const res = await fetch(`${API_BASE}/stream/meta/queue`, {
        headers: {
          Authorization: `Bearer ${tokenRef.current}`,
        },
      });

      if (!res.ok) return;

      const json = await res.json();
      if (Array.isArray(json?.metadata)) {
        // Only apply queue if no newer WS meta update arrived while fetching
        if (metaVersionRef.current !== beforeVer) {
          console.log('[HTTP] Stale queue response ignored due to newer WS update');
          return;
        }
        applyQueueFromServer(json.metadata as any[]);
      }
    } catch (err) {
      // Ignore Queue-Error so it doesn't block UI
    }
  };

  const togglePlayPause = async () => {
    // If there's no sound instance yet, create and start playback
    if (!soundRef.current) {
      await startStream(true);
      return;
    }

    const status = await soundRef.current.getStatusAsync();
    if (!status.isLoaded) return;

    if (status.isPlaying) {
      await soundRef.current.pauseAsync();
    } else {
      // Resume existing sound rather than recreating it
      await soundRef.current.playAsync();
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
      
      console.log("Control called:", path);
      
      // Bei Skip/Previous/JumpTo: Sofort Zeit zurücksetzen.
      // WebSocket `trackChanged` ist die Primär-Quelle — wir setzen nur einen
      // HTTP-Fallback, der nur ausgeführt wird, falls kein `trackChanged`
      // innerhalb von 1500ms empfangen wurde. Dadurch vermeiden wir Rennbedingungen.
      if (path.includes('/skip') || path.includes('/previous') || path.includes('/jumpto')) {
        // Do NOT reset timer or meta here. WebSocket `trackChanged` is authoritative.
        // We only schedule an HTTP fallback if no WS arrives in time.
        // Clear any existing fallback
        if (fallbackTimeoutRef.current) {
          clearTimeout(fallbackTimeoutRef.current);
          fallbackTimeoutRef.current = null;
        }

        // Mark that we're awaiting an authoritative trackChanged from server
        pendingControlRef.current = true;

        // Optimistically reset the visible timer to 0 while waiting for WS.
        // This avoids showing the old song's elapsed until the server responds.
        serverElapsedRef.current = 0;
        serverTimestampRef.current = Date.now();
        setLocalElapsedTime(0);

        const prevMetaTs = lastMetaUpdateRef.current;
        // Set fallback to run after 1500ms only if no WS update occurred
        fallbackTimeoutRef.current = setTimeout(async () => {
          // If lastMetaUpdateRef changed after issuing the control, WS delivered an update
          if (lastMetaUpdateRef.current <= prevMetaTs) {
            console.log('[Control] No WS trackChanged received — falling back to HTTP');
            try {
              await fetchMetadata(true);
              await fetchQueue();
            } catch (e) {
              // ignore fallback errors
            }
          } else {
            console.log('[Control] WS trackChanged received — skipping HTTP fallback');
          }
          fallbackTimeoutRef.current = null;
        }, 1500);
      }
    } catch (err) {
      Alert.alert("Fehler", "Steuerbefehl konnte nicht gesendet werden.");
    }
  };

  const changeVolume = async (delta: number) => {
    if (!tokenRef.current) return;
    const newV = Math.max(0, Math.min(200, Math.round((volume || 0) + delta)));
    
    // Optimistic UI update
    setVolume(newV);
    
    // Debounce API call - reduziert Requests bei schnellen Änderungen
    if (volumeDebounceRef.current) {
      clearTimeout(volumeDebounceRef.current);
    }
    
    volumeDebounceRef.current = setTimeout(async () => {
      try {
        await fetch(`${API_BASE}/stream/control/sound/${newV}`, {
          headers: { Authorization: `Bearer ${tokenRef.current}` },
        });
      } catch (err) {
        // Revert auf Server-Wert bei Fehler
        await loadVolume();
        Alert.alert("Fehler", "Lautstärke konnte nicht gesetzt werden.");
      }
    }, 300); // 300ms debounce
  };

  const logout = async () => {
    await AsyncStorage.removeItem("authToken");
    router.replace("/");
  };

  const progress = (() => {
    const duration = meta?.duration ?? currentSongDurationRef.current ?? 0;
    if (!duration) return 0;
    const elapsed = Math.max(0, localElapsedTime || 0);
    return Math.min(1, Math.max(0, elapsed / duration));
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
      {/* Header */}
      <View style={[styles.headerRow, isDesktop && styles.headerRowDesktop]}>
        <Text style={styles.headerTitle} selectable={false}>MetaWave</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity
            style={styles.headerIcon}
            onPress={() => {
              if (Platform.OS === "web") {
                window.location.reload();
              } else {
                router.replace("/player");
              }
            }}
          >
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
            {meta?.index !== undefined && meta?.total !== undefined && (
              <Text style={styles.queueText} selectable={false}>
                {meta.index + 1} / {meta.total}
              </Text>
            )}
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
                {remainingSeconds > 0 && (
                  <Text style={styles.progressEndLabel} selectable={false}>Endet um: {formatEndClockTime(remainingSeconds)}</Text>
                )}
              </View>
            </View>
          </View>

          {error && <Text style={styles.errorText} selectable={false}>{error}</Text>}

          <View style={styles.controlsRowMain}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => callControl("/stream/control/previous")}>
              <FontAwesomeIcon icon={faBackwardStep} size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.playButton} onPress={togglePlayPause} disabled={playbackLoading}>
              {playbackLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} size={24} color="#FFFFFF" />
              )}
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

          {/* mobile bottom sheet */}
          <Animated.View
            style={[
              styles.bottomSheet,
              {
                height: EXPANDED_HEIGHT,
                transform: [
                  {
                    translateY: sheetTranslateY,
                  },
                ],
              },
            ]}
          >
            {/* Larger touch area for handle */}
            <View 
              {...panResponder.panHandlers} 
              style={styles.sheetHandleTouchArea}
            >
              <View style={styles.sheetHandle} />
            </View>
            <Text style={styles.queueHeader} selectable={false}>Queue</Text>
            <ScrollView
              ref={queueScrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 40 }}
              showsVerticalScrollIndicator
            >
              <View style={{ paddingBottom: 24 }}>
                {queue.map((item, arrayIndex) => {
                  const active = item.isPlaying;
                  const played = item.hasBeenPlayed && !active;
                  const queueIndex = item.index;
                  return (
                    <TouchableOpacity
                      key={`${queueIndex}-${item.song}`}
                      onLayout={(e) => {
                        queueItemLayoutRef.current[arrayIndex] = e.nativeEvent.layout.y;
                      }}
                      style={[styles.queueItem, played && styles.queueItemPlayed, active && styles.queueItemActive]}
                      onPress={() => {
                        callControl(`/stream/control/jumpto/${queueIndex}`);
                        collapseSheet(); // Collapse queue after selecting a song
                      }}
                      activeOpacity={0.7}
                    >
                      <FontAwesomeIcon icon={faGripVertical} size={18} color={active ? colors.primary : "#555555"} style={{ marginRight: 10, opacity: 0.8 } as any} />
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
                      <Text style={[styles.queueDuration, active && { color: colors.primary }]} selectable={false}>{item.duration ? `${Math.round(item.duration / 60)}min` : ""}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.centerContent, isDesktop && styles.centerContentDesktop]}
          showsVerticalScrollIndicator={false}
        >
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
              {meta?.index !== undefined && meta?.total !== undefined && (
                <Text style={styles.queueText} selectable={false}>
                  {meta.index + 1} / {meta.total}
                </Text>
              )}
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
                  {remainingSeconds > 0 && (
                    <Text style={[styles.progressEndLabel, isDesktop && styles.progressEndLabelDesktop]} selectable={false}>Endet um: {formatEndClockTime(remainingSeconds)}</Text>
                  )}
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
            {/* Desktop queue handle like in screenshot */}
            {isDesktop && <View style={styles.queueHandleDesktop} />}
            <Text style={styles.queueHeader} selectable={false}>Queue</Text>
            <ScrollView
              ref={queueScrollRef}
              style={[styles.queueListContent, { flex: 1 }]}
              contentContainerStyle={{ paddingBottom: 24 }}
              showsVerticalScrollIndicator
              {...(Platform.OS === "web" ? ({ className: "queue-scroll" } as any) : {})}
            >
              <View style={{ flex: 1 }}>
                {queue.map((item, arrayIndex) => {
                  const active = item.isPlaying;
                  const played = item.hasBeenPlayed && !active;
                  const queueIndex = item.index;
                  return (
                    <TouchableOpacity
                      key={`${queueIndex}-${item.song}`}
                      onLayout={(e) => {
                        queueItemLayoutRef.current[arrayIndex] = e.nativeEvent.layout.y;
                      }}
                      style={[styles.queueItem, played && styles.queueItemPlayed, active && styles.queueItemActive]}
                      onPress={() => {
                        callControl(`/stream/control/jumpto/${queueIndex}`);
                      }}
                      activeOpacity={0.7}
                    >
                      <FontAwesomeIcon icon={faGripVertical} size={18} color={active ? colors.primary : "#555555"} style={{ marginRight: 10, opacity: 0.8 } as any} />
                      {item.cover ? (
                        <Image source={{ uri: item.cover }} style={styles.queueThumbnail} />
                      ) : (
                        <View style={[styles.queueThumbnail, styles.queueThumbnailPlaceholder]}>
                          <Text style={styles.queueThumbnailText}>♪</Text>
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
                      <Text style={[styles.queueDuration, active && { color: colors.primary }]} selectable={false}>{item.duration ? `${Math.round(item.duration / 60)}min` : ""}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      )}
      
      {/* Mobile back button (like settings) */}
      {!isDesktop && (
        null
      )}

      {/* Footer - only on desktop */}
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
          <Text style={styles.footerVersion}>v1.0.0</Text>
        </View>
      )}
    </SafeAreaView>
  );
}
