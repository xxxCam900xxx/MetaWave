import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { API_BASE } from "../api/client";

export default function AudioPlayer({ token }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const streamUrl = `${API_BASE}/stream?token=${token}`;

  const togglePlay = async () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      await audioRef.current.play();
    }
    setPlaying(!playing);
  };

  const skipTrack = async () => {
    try {
      await api.post("/skip"); // Header Token wird automatisch über api.defaults.headers gesendet
      console.log("Song geskippt");
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <audio ref={audioRef} src={streamUrl} preload="none" controls />
      <div style={{ marginTop: 10 }}>
        <button onClick={togglePlay}>
          {playing ? "Pause" : "Play"}
        </button>
        <button onClick={skipTrack} style={{ marginLeft: 10 }}>
          Skip
        </button>
      </div>
    </div>
  );
}