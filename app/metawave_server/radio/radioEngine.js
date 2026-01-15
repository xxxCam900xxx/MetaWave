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
      console.warn("currentIndex außerhalb der Queue:", this.currentIndex);
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

    // Immer abspielen, auch ohne Clients
    console.log("Now playing:", song.title);

    const startTime = Date.now();
    this.emit("meta", this.getMeta());

    const ffmpegArgs = [
      "-re",
      "-i", filePath,
      "-f", "mp3",
      "-b:a", "128k",
      "-content_type", "audio/mpeg",
      "pipe:1"
    ];

    this.currentProcess = spawn("ffmpeg", ffmpegArgs);
    this.currentProcess.elapsedTime = 0;

    this.currentProcess.stdout.on("data", chunk => {
      // HTTP Clients
      for (const res of this.clients) res.write(chunk);
      // WS Clients
      for (const ws of this.wsClients) {
        if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
      }

      this.currentProcess.elapsedTime = Math.floor((Date.now() - startTime) / 1000);
    });

    this.currentProcess.stderr.on("data", chunk => {
      // ffmpeg Fehler ausgeben, nicht blockieren
      console.error(chunk.toString());
    });

    this.currentProcess.on("exit", () => {
      this.currentProcess = null;
      this.currentIndex++;

      if (this.currentIndex >= this.queue.length) {
        console.log("Ende der Queue erreicht, beginne von vorn.");
        this.currentIndex = 0;
      }

      const meta = this.getMeta();
      for (const ws of this.wsClients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "trackChanged", meta }));
        }
      }

      // Nächsten Song starten
      this.playNext();
    });
  }

  addClient(res) {
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));

    if (!this.currentProcess && this.queue.length > 0) this.playNext();
  }

  addWSClient(ws) {
    this.wsClients.add(ws);
    ws.on("close", () => this.wsClients.delete(ws));

    if (!this.currentProcess && this.queue.length > 0) this.playNext();
  }

  skip() {
    if (this.currentProcess) {
      console.log("Skip requested");
      this.currentProcess.kill("SIGKILL");
    }
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
      elapsed: this.currentProcess?.elapsedTime || 0
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
        isPlaying: index === this.currentIndex
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