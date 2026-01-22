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
      for (const res of this.clients) res.write(chunk);
      for (const ws of this.wsClients) {
        if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
      }
      this.currentProcess.elapsedTime = Math.floor((Date.now() - startTime) / 1000);
    });

    this.currentProcess.stderr.on("data", chunk => {
      console.error(chunk.toString());
    });

    this.currentProcess.on("exit", () => {
      this.currentProcess = null;
      this.currentIndex++;

      // Queue Ende erreicht
      if (this.currentIndex >= this.queue.length) {
        console.log("Ende der Queue erreicht, shuffle und beginne von vorn.");
        this.shuffleQueue();
        this.currentIndex = 0;
      }

      const meta = this.getMeta();
      for (const ws of this.wsClients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "trackChanged", meta }));
        }
      }

      // Nach jedem Trackwechsel die Queue mitsamt hasBeenPlayed/isPlaying aktualisieren
      this.broadcastQueueUpdate();

      this.playNext();
    });
  }

  // Neue Methode zum Shuffle der gesamten Queue
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

  previous() {
    if (!this.queue.length) return;

    console.log("Previous requested");

    // Zielindex berechnen (eins zurück, mit Wrap zum letzten Element)
    const targetIndex = this.currentIndex > 0 ? this.currentIndex - 1 : Math.max(0, this.queue.length - 1);

    if (this.currentProcess) {
      // currentIndex so setzen, dass nach dem ++ im exit-Handler genau targetIndex gespielt wird
      this.currentIndex = targetIndex - 1;
      this.currentProcess.kill("SIGKILL");
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

    if (this.currentProcess) {
      // currentIndex so setzen, dass nach dem automatischen ++ im exit-Handler
      // genau der gewünschte Track gespielt wird.
      this.currentIndex = targetIndex - 1;
      this.currentProcess.kill("SIGKILL");
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