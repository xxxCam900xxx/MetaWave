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

  // --- WebSocket + MediaSource Setup ---
  useEffect(() => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    const mediaSource = new MediaSource();
    mediaSourceRef.current = mediaSource;
    audio.src = URL.createObjectURL(mediaSource);

    const handleSourceOpen = () => {
      sourceBufferRef.current = mediaSource.addSourceBuffer("audio/mpeg");

      const ws = new WebSocket(`ws://knobbiest-vickie-lifelike.ngrok-free.dev?token=${token}`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onmessage = async (event) => {
        if (typeof event.data === "string") {
          try {
            const msg = JSON.parse(event.data);

            // Trackwechsel
            if (msg.type === "trackChanged") {
              setCurrentIndex(msg.meta.index);

              if (sourceBufferRef.current) {
                sourceBufferRef.current.abort();
                const newMediaSource = new MediaSource();
                mediaSourceRef.current = newMediaSource;
                audio.src = URL.createObjectURL(newMediaSource);
                newMediaSource.addEventListener("sourceopen", () => {
                  sourceBufferRef.current = newMediaSource.addSourceBuffer("audio/mpeg");
                });
                audio.play();
              }
            }

            // Queue Update
            if (msg.type === "queueUpdated") {
              setQueue(msg.queue.queue || []);
            }
          } catch (err) {
            console.error("WS JSON Parse Fehler:", err);
          }
        } else {
          // Live Audio-Daten anhängen
          const chunk = new Uint8Array(event.data);
          if (!sourceBufferRef.current) return;

          await new Promise((resolve) => {
            const append = () => {
              if (!sourceBufferRef.current.updating) {
                sourceBufferRef.current.appendBuffer(chunk);
              } else {
                sourceBufferRef.current.addEventListener("updateend", append, { once: true });
              }
              sourceBufferRef.current.addEventListener("updateend", resolve, { once: true });
            };
            append();
          });
        }
      };
    };

    mediaSource.addEventListener("sourceopen", handleSourceOpen);

    return () => {
      wsRef.current?.close();
      mediaSource.removeEventListener("sourceopen", handleSourceOpen);
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

  const jumpTo = async (index) => {
    try {
      await api.post("/jump-to", { index });
    } catch (err) {
      console.error("JumpTo fehlgeschlagen:", err);
    }
  };

  // --- Render ---
  return (
    <div style={{ display: "flex", maxWidth: 900, border: "1px solid #ccc", borderRadius: 8 }}>
      {/* --- Left: Player --- */}
      <div style={{ flex: 1, padding: 20 }}>
        <audio ref={audioRef} controls style={{ width: "100%" }} />
        <div style={{ marginTop: 10 }}>
          <button onClick={togglePlay}>{playing ? "Pause" : "Play"}</button>
          <button onClick={skip} style={{ marginLeft: 10 }}>Skip</button>
          <button onClick={shuffle} style={{ marginLeft: 10 }}>Shuffle</button>
        </div>
      </div>

      {/* --- Right: Queue --- */}
      <div style={{ flex: 1, padding: 20, maxHeight: 400, overflowY: "auto", borderLeft: "1px solid #ccc" }}>
        <h3>Queue</h3>
        {queue.map((song, i) => (
          <div
            key={i}
            style={{
              padding: 5,
              background: i === currentIndex ? "#ddd" : "transparent",
              cursor: "pointer",
            }}
            onClick={() => jumpTo(i)}
          >
            {song.index + 1}. {song.title} - {song.author}
          </div>
        ))}
      </div>
    </div>
  );
}