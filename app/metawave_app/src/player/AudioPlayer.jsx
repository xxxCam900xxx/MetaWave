import { useRef, useEffect, useState } from "react";
import { api } from "../api/client";

export default function AudioPlayer({ token }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const sourceBufferRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const wsRef = useRef(null);
  const appendAbortRef = useRef(false);

  // --- Initial Queue vom Server laden ---
  useEffect(() => {
    const fetchQueue = async () => {
      try {
        const res = await api.get("/meta-queue");
        if (res.data) {
          setQueue(res.data.queue || []);
          setCurrentIndex(res.data.nowPlayingIndex || 0);
        }
      } catch (err) {
        console.error("Fehler beim Laden der Queue:", err);
      }
    };
    fetchQueue();
  }, []);

  // --- MediaSource Setup ---
  const initMediaSource = () =>
    new Promise((resolve) => {
      const audio = audioRef.current;
      if (!audio) return;

      const mediaSource = new MediaSource();
      mediaSourceRef.current = mediaSource;
      audio.src = URL.createObjectURL(mediaSource);

      const onSourceOpen = () => {
        mediaSource.removeEventListener("sourceopen", onSourceOpen);
        try {
          sourceBufferRef.current = mediaSource.addSourceBuffer("audio/mpeg");
        } catch (err) {
          console.error("addSourceBuffer Error:", err);
        }
        appendAbortRef.current = false;
        resolve();
      };

      mediaSource.addEventListener("sourceopen", onSourceOpen);
    });

  // --- WebSocket Setup ---
  useEffect(() => {
    if (!audioRef.current) return;

    const setupWS = async () => {
      await initMediaSource();

      const ws = new WebSocket(`ws://knobbiest-vickie-lifelike.ngrok-free.dev?token=${token}`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onmessage = async (event) => {
        try {
          if (typeof event.data === "string") {
            const msg = JSON.parse(event.data);

            if (msg.type === "jumpStart" || msg.type === "trackChanged") {
              appendAbortRef.current = true;
              await initMediaSource();
              if (msg.meta?.index !== undefined) setCurrentIndex(msg.meta.index);
              if (msg.type === "trackChanged") audioRef.current.play();
            }

            if (msg.type === "queueUpdated") {
              setQueue(msg.queue.queue || []);
            }
          } else {
            const chunk = new Uint8Array(event.data);
            if (!sourceBufferRef.current || appendAbortRef.current) return;

            const appendChunk = () => {
              if (!sourceBufferRef.current || appendAbortRef.current) return;
              if (!sourceBufferRef.current.updating) {
                try {
                  sourceBufferRef.current.appendBuffer(chunk);
                } catch (err) {
                  console.error("appendBuffer Error:", err);
                }
              } else {
                sourceBufferRef.current.addEventListener("updateend", appendChunk, { once: true });
              }
            };
            appendChunk();
          }
        } catch (err) {
          console.error("WS JSON Parse Fehler:", err);
        }
      };
    };

    setupWS();

    return () => {
      wsRef.current?.close();
    };
  }, [token]);

  // --- Player Controls ---
  const togglePlay = async () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else await audioRef.current.play();
    setPlaying(!playing);
  };

  const skip = async () => {
    try {
      await api.post("/skip");
    } catch (err) {
      console.error("Skip fehlgeschlagen:", err);
    }
  };

  const shuffle = async () => {
    try {
      await api.post("/shuffle");
    } catch (err) {
      console.error("Shuffle fehlgeschlagen:", err);
    }
  };

  // --- Render ---
  const nowPlaying = queue[currentIndex];

  return (
    <div style={{ display: "flex", maxWidth: 900, border: "1px solid #ccc", borderRadius: 8 }}>
      <div style={{ flex: 1, padding: 20 }}>
        {nowPlaying && (
          <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            <img
              src={nowPlaying.cover}
              alt={nowPlaying.title}
              style={{
                width: 60,
                height: 60,
                borderRadius: 4,
                marginRight: 10,
                objectFit: "cover"
              }}
            />
            <div>
              <div style={{ fontWeight: "bold" }}>{nowPlaying.title}</div>
              <div style={{ fontSize: 12, color: "#555" }}>{nowPlaying.author}</div>
            </div>
          </div>
        )}

        <audio ref={audioRef} controls style={{ width: "100%" }} />

        <div style={{ marginTop: 10 }}>
          <button onClick={togglePlay}>{playing ? "Pause" : "Play"}</button>
          <button onClick={skip} style={{ marginLeft: 10 }}>Skip</button>
          <button onClick={shuffle} style={{ marginLeft: 10 }}>Shuffle</button>
        </div>
      </div>

      <div style={{ flex: 1, padding: 20, maxHeight: 400, overflowY: "auto", borderLeft: "1px solid #ccc" }}>
        <h3>Queue</h3>
        {queue.map((song, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              padding: 5,
              background: i === currentIndex ? "#ddd" : "transparent",
              cursor: "pointer",
            }}
          >
            {song.cover && (
              <img
                src={song.cover}
                alt={song.title}
                style={{ width: 40, height: 40, borderRadius: 4, marginRight: 10, objectFit: "cover" }}
              />
            )}
            <div>
              <div style={{ fontWeight: i === currentIndex ? "bold" : "normal" }}>
                {song.index + 1}. {song.title}
              </div>
              <div style={{ fontSize: 12, color: "#555" }}>{song.author}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}