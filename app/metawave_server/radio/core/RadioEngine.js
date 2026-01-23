import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import EventEmitter from "events";
import WebSocket from "ws";

const SONGS_DIR = path.resolve("/songs");
const METADATA_FILE = path.join(SONGS_DIR, "metadata.json");

export class RadioEngine extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.currentIndex = 0;
    this.currentProcess = null;
    this.clients = new Set();   // HTTP Clients für /stream
    this.wsClients = new Set(); // WebSocket Clients
    this.volumePercent = 100; // global volume in percent (100 = normal)
    this._restartSame = false; // internal flag to restart same track (used when applying volume)
    this.currentDecoder = null;
    this.currentEncoder = null;
    this.currentProcessElapsedTime = 0;
    this.currentVolumeMultiplier = this.volumePercent / 100;
    this._volumeSmoothInterval = null;
    this.loadQueue();
  }

  loadQueue() {
    if (!fs.existsSync(METADATA_FILE)) {
      console.warn("Keine Metadaten gefunden, lade nur Dateinamen");

      const files = fs.readdirSync(SONGS_DIR)
        .filter(f => f.endsWith(".mp3") && !f.endsWith(".info.mp3"));

      this.queue = files.map(f => ({ filename: f, title: f }));
      console.log("Queue loaded:", this.queue.map(s => s.title));
      return;
    }

    try {
      const data = JSON.parse(fs.readFileSync(METADATA_FILE, "utf-8"));

      // Nur Songs, deren .mp3 existiert und nicht .info.mp3
      this.queue = data
        .filter(s => s?.filename && fs.existsSync(path.join(SONGS_DIR, s.filename)) && !s.filename.endsWith(".info.mp3"))
        .map(s => ({
          filename: s.filename,
          title: s.title || s.filename,
          author: s.author || "",
          cover: s.cover || "",
          duration: s.duration || 0
        }));
    } catch (err) {
      console.error("Fehler beim Laden der Metadaten:", err);
      this.queue = [];
    }

    console.log("Queue loaded:", this.queue.map(s => s.title));
  }

  playNext() {
    if (!this.queue.length) return;

    if (this.currentIndex < 0 || this.currentIndex >= this.queue.length) {
      console.warn("currentIndex ausserhalb der Queue:", this.currentIndex);
      return;
    }

    const song = this.queue[this.currentIndex];
    if (!song) {
      console.warn("Song undefined bei index:", this.currentIndex);
      return;
    }

    const filePath = path.join(SONGS_DIR, song.filename);
    if (!fs.existsSync(filePath)) {
      console.warn("Datei existiert nicht:", filePath);
      this.currentIndex++;
      if (this.currentIndex < this.queue.length) this.playNext();
      return;
    }

    console.log("Now playing:", song.title);

    const startTime = Date.now();
    this.emit("meta", this.getMeta());

    // Decoder -> PCM -> process in JS -> Encoder -> MP3
    const decoderArgs = [
      "-re",
      "-i", filePath,
      "-f", "s16le",
      "-ar", "44100",
      "-ac", "2",
      "pipe:1"
    ];

    const encoderArgs = [
      "-f", "s16le",
      "-ar", "44100",
      "-ac", "2",
      "-i", "pipe:0",
      "-f", "mp3",
      "-b:a", "128k",
      "pipe:1"
    ];

    const decoder = spawn("ffmpeg", decoderArgs, { stdio: ["ignore", "pipe", "pipe"] });
    const encoder = spawn("ffmpeg", encoderArgs, { stdio: ["pipe", "pipe", "pipe"] });

    this.currentDecoder = decoder;
    this.currentEncoder = encoder;
    this.currentProcessElapsedTime = 0;

    const processPCM = (buffer, multiplier) => {
      const out = Buffer.allocUnsafe(buffer.length);
      for (let i = 0; i + 1 < buffer.length; i += 2) {
        const sample = buffer.readInt16LE(i);
        let v = Math.round(sample * multiplier);
        if (v > 32767) v = 32767;
        if (v < -32768) v = -32768;
        out.writeInt16LE(v, i);
      }
      return out;
    };

    decoder.stdout.on("data", (chunk) => {
      try {
        const processed = processPCM(chunk, (this.currentVolumeMultiplier ?? (this.volumePercent / 100)));
        encoder.stdin.write(processed);
      } catch (e) {
        // ignore
      }
      this.currentProcessElapsedTime = Math.floor((Date.now() - startTime) / 1000);
    });

    encoder.stdout.on("data", (mp3chunk) => {
      for (const res of this.clients) try { res.write(mp3chunk); } catch (e) {}
      for (const ws of this.wsClients) {
        if (ws.readyState === WebSocket.OPEN) try { ws.send(mp3chunk); } catch (e) {}
      }
    });

    const onExit = () => {
      this.currentDecoder = null;
      this.currentEncoder = null;

      if (this._restartSame) {
        this._restartSame = false;
      } else {
        this.currentIndex++;
        if (this.currentIndex >= this.queue.length) {
          console.log("Ende der Queue erreicht, shuffle und beginne von vorn.");
          this.shuffleQueue();
          this.currentIndex = 0;
        }
      }

      const meta = this.getMeta();
      for (const ws of this.wsClients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "trackChanged", meta }));
        }
      }

      this.broadcastQueueUpdate();
      this.playNext();
    };

    encoder.on("exit", onExit);
    decoder.on("exit", () => {
      try { encoder.stdin.end(); } catch (e) {}
    });

    decoder.stderr.on("data", (chunk) => console.error(chunk.toString()));
    encoder.stderr.on("data", (chunk) => console.error(chunk.toString()));
  }

  setVolume(percent) {
    const p = Number(percent) || 0;
    const clamped = Math.max(0, Math.min(200, Math.round(p)));
    const targetMultiplier = clamped / 100;
    this.volumePercent = clamped;
    this.broadcastVolumeUpdate();

    // Smoothly interpolate currentVolumeMultiplier -> targetMultiplier over ~600ms
    if (this._volumeSmoothInterval) {
      clearInterval(this._volumeSmoothInterval);
      this._volumeSmoothInterval = null;
    }

    if (!this.currentVolumeMultiplier) this.currentVolumeMultiplier = targetMultiplier;
    const duration = 600;
    const steps = 12;
    const stepMs = Math.max(30, Math.floor(duration / steps));
    const start = this.currentVolumeMultiplier;
    const delta = (targetMultiplier - start) / steps;
    let step = 0;
    this._volumeSmoothInterval = setInterval(() => {
      step++;
      this.currentVolumeMultiplier = start + delta * step;
      if (step >= steps) {
        this.currentVolumeMultiplier = targetMultiplier;
        clearInterval(this._volumeSmoothInterval);
        this._volumeSmoothInterval = null;
      }
    }, stepMs);
  }

  broadcastVolumeUpdate() {
    const payload = JSON.stringify({ type: "volumeChanged", volume: this.volumePercent });
    for (const ws of this.wsClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  shuffleQueue() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.broadcastQueueUpdate();
  }

  addClient(res) {
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));

    if (!this.currentDecoder && !this.currentEncoder && this.queue.length > 0) this.playNext();
  }

  addWSClient(ws) {
    this.wsClients.add(ws);
    ws.on("close", () => this.wsClients.delete(ws));

    if (!this.currentDecoder && !this.currentEncoder && this.queue.length > 0) this.playNext();
  }

  skip() {
    if (this.currentDecoder || this.currentEncoder) {
      console.log("Skip requested");
      try { if (this.currentDecoder) this.currentDecoder.kill("SIGKILL"); } catch (e) {}
      try { if (this.currentEncoder) this.currentEncoder.kill("SIGKILL"); } catch (e) {}
    }
  }

  previous() {
    if (!this.queue.length) return;

    console.log("Previous requested");

    const targetIndex = this.currentIndex > 0 ? this.currentIndex - 1 : Math.max(0, this.queue.length - 1);

    if (this.currentDecoder || this.currentEncoder) {
      this.currentIndex = targetIndex - 1;
      try { if (this.currentDecoder) this.currentDecoder.kill("SIGKILL"); } catch (e) {}
      try { if (this.currentEncoder) this.currentEncoder.kill("SIGKILL"); } catch (e) {}
    } else {
      this.currentIndex = targetIndex;
      this.playNext();
    }
  }

  jumpto(index) {
    const idx = Number(index);
    if (Number.isNaN(idx) || idx < 0 || idx >= this.queue.length) {
      console.warn("jumpto: invalid index", index);
      return;
    }

    if (idx === this.currentIndex) return;

    let targetIndex = idx;

    // Wenn nach vorne gesprungen wird: Songs dazwischen wieder in die Rest-Queue packen
    // und neu shuffeln, damit sie später wieder vorkommen.
    if (idx > this.currentIndex) {
      const played = this.queue.slice(0, this.currentIndex + 1);
      const target = this.queue[idx];
      const skipped = this.queue.slice(this.currentIndex + 1, idx);
      const remaining = this.queue.slice(idx + 1);

      const leftovers = [...skipped, ...remaining];

      // Fisher-Yates Shuffle für die übrigen Songs
      for (let i = leftovers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [leftovers[i], leftovers[j]] = [leftovers[j], leftovers[i]];
      }

      this.queue = [...played, target, ...leftovers];
      targetIndex = played.length; // Index des gewählten Songs in der neuen Queue
    }

    if (this.currentDecoder || this.currentEncoder) {
      // currentIndex so setzen, dass nach dem automatischen ++ im exit-Handler
      // genau der gewünschte Track gespielt wird.
      this.currentIndex = targetIndex - 1;
      try { if (this.currentDecoder) this.currentDecoder.kill("SIGKILL"); } catch (e) {}
      try { if (this.currentEncoder) this.currentEncoder.kill("SIGKILL"); } catch (e) {}
    } else {
      this.currentIndex = targetIndex;
      this.playNext();
    }

    this.broadcastQueueUpdate();
  }

  getMeta() {
    const song = this.queue[this.currentIndex];
    return {
      filename: song?.filename || "",
      title: song?.title || "",
      author: song?.author || "",
      cover: song?.cover || "",
      duration: song?.duration || 0,
      index: this.currentIndex,
      total: this.queue.length,
      elapsed: this.currentProcessElapsedTime || 0
    };
  }

  getQueueState() {
    return {
      nowPlayingIndex: this.currentIndex,
      nowPlaying: this.queue[this.currentIndex]?.filename || "",
      queue: this.queue.map((song, index) => ({
        song: song.filename,
        title: song.title,
        author: song.author,
        duration: song.duration,
        cover: song.cover,
        index,
        isPlaying: index === this.currentIndex,
        hasBeenPlayed: index < this.currentIndex
      }))
    };
  }

  shuffleRemaining() {
    const played = this.queue.slice(0, this.currentIndex + 1);
    const remaining = this.queue.slice(this.currentIndex + 1);

    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }

    this.queue = [...played, ...remaining];
    this.broadcastQueueUpdate();
  }

  broadcastQueueUpdate() {
    const payload = JSON.stringify({
      type: "queueUpdated",
      queue: this.getQueueState()
    });

    for (const ws of this.wsClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }
}

export const radio = new RadioEngine();