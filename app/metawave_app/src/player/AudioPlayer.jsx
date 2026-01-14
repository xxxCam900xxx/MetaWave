import { useRef, useEffect, useState } from "react";
import { api } from "../api/client";

export default function AudioPlayer({ token }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [ws, setWs] = useState(null);
  const sourceBufferRef = useRef(null);
  const mediaSourceRef = useRef(null);

  useEffect(() => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    const mediaSource = new MediaSource();
    audio.src = URL.createObjectURL(mediaSource);
    mediaSourceRef.current = mediaSource;

    mediaSource.addEventListener("sourceopen", () => {
      const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
      sourceBufferRef.current = sourceBuffer;

      const socket = new WebSocket(`ws://knobbiest-vickie-lifelike.ngrok-free.dev?token=${token}`);
      socket.binaryType = "arraybuffer";
      setWs(socket);

      socket.onmessage = async (event) => {
        // Wenn Server ein Event in JSON schickt
        if (typeof event.data === "string") {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "trackChanged") {
              console.log("Track gewechselt:", msg.meta.song);
              if (sourceBufferRef.current) {
                // Buffer stoppen und leeren
                sourceBufferRef.current.abort();
                // MediaSource reset
                const newMediaSource = new MediaSource();
                mediaSourceRef.current = newMediaSource;
                audio.src = URL.createObjectURL(newMediaSource);
                newMediaSource.addEventListener("sourceopen", () => {
                  sourceBufferRef.current = newMediaSource.addSourceBuffer("audio/mpeg");
                });
                audio.play();
              }
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
    });

    return () => ws?.close();
  }, [token]);

  const togglePlay = async () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else await audioRef.current.play();
    setPlaying(!playing);
  };

  const skip = async () => {
    try {
      await api.post("/skip"); // Server skip
      console.log("Song geskippt");
      // WebSocket Event trackChanged wird vom Server kommen und MSE reset triggern
    } catch (err) {
      console.error("Skip fehlgeschlagen:", err);
    }
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <audio ref={audioRef} controls />
      <div style={{ marginTop: 10 }}>
        <button onClick={togglePlay}>{playing ? "Pause" : "Play"}</button>
        <button onClick={skip} style={{ marginLeft: 10 }}>Skip</button>
      </div>
    </div>
  );
}