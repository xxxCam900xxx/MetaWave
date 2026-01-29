import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import EventEmitter from "events";
import WebSocket from "ws";
import { Transform } from "stream";

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
    this._restartSame = false;
    this.currentDecoder = null;
    this.currentEncoder = null;
    this.currentProcessElapsedTime = 0;
    this.currentVolumeMultiplier = this.volumePercent / 100;
    this.monotoneEnabled = false;
    this.monotoneReduceLoud = false;  // Toggle: Auch laute Songs reduzieren?
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
    
    if (this.queue.length > 0) {
      this.shuffleQueue();
      console.log("Queue shuffled on initial load");
    }
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

    // New pipeline: decoder -> live gain Transform -> encoder
    // Decoder: decode to signed 16-bit PCM, 2 channels, 44100 Hz
    const decoderArgs = [
      "-re",
      "-i", filePath,
      "-f", "s16le",
      "-acodec", "pcm_s16le",
      "-ac", "2",
      "-ar", "44100",
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

    // Live gain transform: applies currentVolumeMultiplier and optional LUFS-based gain
    const SAMPLE_MAX = 32767;
    class GainTransform extends Transform {
      constructor(getMultiplier) {
        super();
        this.getMultiplier = getMultiplier;
      }
      _transform(chunk, encoding, callback) {
        try {
          const mult = this.getMultiplier() || 1;
          // operate on 16-bit samples
          const out = Buffer.alloc(chunk.length);
          for (let i = 0; i < chunk.length; i += 2) {
            const sample = chunk.readInt16LE(i);
            let s = Math.round(sample * mult);
            if (s > SAMPLE_MAX) s = SAMPLE_MAX;
            if (s < -SAMPLE_MAX - 1) s = -SAMPLE_MAX - 1;
            out.writeInt16LE(s, i);
          }
          this.push(out);
          callback();
        } catch (err) {
          callback(err);
        }
      }
    }

    const getMultiplier = () => {
      const vol = this.currentVolumeMultiplier ?? (this.volumePercent / 100);
      let monoMult = 1;
      if (this.monotoneEnabled && song.lufs) {
        const targetLUFS = -16.0;
        const currentLUFS = song.lufs.input_i;
        let gainDb = targetLUFS - currentLUFS; // positive => boost, negative => reduce
        if (gainDb < 0 && !this.monotoneReduceLoud) gainDb = 0;
        monoMult = Math.pow(10, gainDb / 20);
      }
      return vol * monoMult;
    };

    const gainTransform = new GainTransform(getMultiplier);

    // Pipe decoder -> gainTransform -> encoder
    decoder.stdout.pipe(gainTransform).pipe(encoder.stdin);

    // MP3 Stream direkt zu Clients streamen
    encoder.stdout.on("data", (mp3chunk) => {
      this.currentProcessElapsedTime = Math.floor((Date.now() - startTime) / 1000);
      for (const res of this.clients) try { res.write(mp3chunk); } catch (e) {}
      for (const ws of this.wsClients) {
        if (ws.readyState === WebSocket.OPEN) try { ws.send(mp3chunk); } catch (e) {}
      }
    });

    const onExit = (code, signal) => {
      // Cleanup references
      this.currentDecoder = null;
      this.currentEncoder = null;

      // advance to next track
      this.currentIndex++;
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

      this.broadcastQueueUpdate();
      this.playNext();
    };

    const handleErr = (chunk) => {
      const msg = chunk.toString();
      if (msg.includes("error") || msg.includes("Error")) {
        console.error("[FFmpeg Error]", msg);
      }
    };

    decoder.on("exit", onExit);
    encoder.on("exit", onExit);
    decoder.stderr.on("data", handleErr);
    encoder.stderr.on("data", handleErr);
  }

  setVolume(percent) {
    const p = Number(percent) || 0;
    const clamped = Math.max(0, Math.min(200, Math.round(p)));
    this.volumePercent = clamped;
    this.currentVolumeMultiplier = clamped / 100;
    this.broadcastVolumeUpdate();
    // Live gain transform nutzt `this.currentVolumeMultiplier` so that
    // volume changes are applied immediately without restarting the decoder/encoder.
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

    if (!this.currentDecoder && this.queue.length > 0) this.playNext();
  }

  addWSClient(ws) {
    this.wsClients.add(ws);
    ws.on("close", () => this.wsClients.delete(ws));

    if (!this.currentDecoder && this.queue.length > 0) this.playNext();
  }

  skip() {
    if (this.currentDecoder) {
      console.log("Skip requested");
      try { if (this.currentDecoder) this.currentDecoder.kill("SIGKILL"); } catch (e) {}
    }
  }

  previous() {
    if (!this.queue.length) return;

    console.log("Previous requested");

    const targetIndex = this.currentIndex > 0 ? this.currentIndex - 1 : Math.max(0, this.queue.length - 1);

    if (this.currentDecoder) {
      this.currentIndex = targetIndex - 1;
      try { if (this.currentDecoder) this.currentDecoder.kill("SIGKILL"); } catch (e) {}
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
    } else if (idx < this.currentIndex) {
      const oldCurrent = this.currentIndex;

      for (let i = 0; i < oldCurrent; i++) {
        if (this.queue[i]) this.queue[i].hasBeenPlayed = true;
      }

      const target = this.queue[idx];
      if (!target) return;

      this.queue.splice(idx, 1);

      const newCurrent = Math.max(0, oldCurrent - 1);
      const insertPos = newCurrent + 1;
      this.queue.splice(insertPos, 0, target);

      if (this.currentDecoder) {
        this.currentIndex = newCurrent;
        try { if (this.currentDecoder) this.currentDecoder.kill("SIGKILL"); } catch (e) {}
      } else {
        this.currentIndex = insertPos;
        this.playNext();
      }

      this.broadcastQueueUpdate();
      return;
    }

    if (this.currentDecoder) {
      // currentIndex so setzen, dass nach dem automatischen ++ im exit-Handler
      // genau der gewünschte Track gespielt wird.
      this.currentIndex = targetIndex - 1;
      try { if (this.currentDecoder) this.currentDecoder.kill("SIGKILL"); } catch (e) {}
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
        hasBeenPlayed: (typeof song.hasBeenPlayed === "boolean") ? song.hasBeenPlayed : (index < this.currentIndex)
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

  setMonotoneEnabled(enabled) {
    this.monotoneEnabled = Boolean(enabled);
    console.log(`EBU R128 Loudness Normalization ${this.monotoneEnabled ? 'enabled' : 'disabled'}`);
    
    this.broadcastSettingsUpdate();
    // Live gain transform reads `this.monotoneEnabled` and `this.monotoneReduceLoud` dynamically.
    // No restart/killing of ffmpeg necessary.
  }

  setMonotoneReduceLoud(enabled) {
    this.monotoneReduceLoud = Boolean(enabled);
    console.log(`EBU R128 Reduce Loud Songs ${this.monotoneReduceLoud ? 'enabled' : 'disabled'}`);
    
    this.broadcastSettingsUpdate();
    // Live gain transform reads `this.monotoneReduceLoud` dynamically.
    // No restart required.
  }

  getSettings() {
    return {
      monotoneEnabled: this.monotoneEnabled,
      monotoneReduceLoud: this.monotoneReduceLoud
    };
  }

  broadcastSettingsUpdate() {
    const payload = JSON.stringify({
      type: "settingsUpdated",
      settings: this.getSettings()
    });

    for (const ws of this.wsClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }
}

export const radio = new RadioEngine();