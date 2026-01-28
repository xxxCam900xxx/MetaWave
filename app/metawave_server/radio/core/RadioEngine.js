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

    // Single-Pass FFmpeg mit EBU R128 loudnorm Filter
    // Verwende gespeicherte LUFS-Werte für precise normalization (Second Pass)
    const ffmpegArgs = [
      "-re",
      "-i", filePath
    ];

    // Audio Filter Chain aufbauen
    let audioFilters = [];

    // 1. EBU R128 Loudness Normalization (wenn LUFS-Daten vorhanden)
    if (this.monotoneEnabled && song.lufs) {
      const targetLUFS = -16.0;
      const targetTP = -1.5;
      const targetLRA = 11.0;
      const currentLUFS = song.lufs.input_i;
      
      // Entscheide ob normalisiert werden soll:
      // - Immer boosten wenn Song zu leise (< -16 LUFS)
      // - Nur reduzieren wenn reduceLoud aktiviert UND Song zu laut (> -16 LUFS)
      const shouldNormalize = currentLUFS < targetLUFS || this.monotoneReduceLoud;
      
      if (shouldNormalize) {
        // Second Pass mit gemessenen Werten für precise normalization
        const loudnormFilter = `loudnorm=I=${targetLUFS}:TP=${targetTP}:LRA=${targetLRA}:` +
          `measured_I=${song.lufs.input_i}:` +
          `measured_TP=${song.lufs.input_tp}:` +
          `measured_LRA=${song.lufs.input_lra}:` +
          `measured_thresh=${song.lufs.input_thresh}:` +
          `offset=${song.lufs.target_offset}:` +
          `linear=true:print_format=summary`;
        
        audioFilters.push(loudnormFilter);
        
        if (currentLUFS < targetLUFS) {
          console.log(`[LUFS] ⬆️  Boost ${song.title}: ${currentLUFS.toFixed(1)} → ${targetLUFS} LUFS`);
        } else {
          console.log(`[LUFS] ⬇️  Reduce ${song.title}: ${currentLUFS.toFixed(1)} → ${targetLUFS} LUFS`);
        }
      } else {
        console.log(`[LUFS] ➡️  Skip ${song.title}: ${currentLUFS.toFixed(1)} LUFS (bereits laut genug)`);
      }
    } else if (this.monotoneEnabled && !song.lufs) {
      // Fallback: First Pass loudnorm (langsamer, aber funktioniert ohne gespeicherte Werte)
      console.log(`[LUFS] Keine LUFS-Daten für ${song.title}, verwende First-Pass Normalisierung`);
      audioFilters.push("loudnorm=I=-16:TP=-1.5:LRA=11:print_format=summary");
    }

    // 2. Volume Control (User-Lautstärke)
    const volumeFilter = `volume=${(this.currentVolumeMultiplier ?? (this.volumePercent / 100)).toFixed(3)}`;
    audioFilters.push(volumeFilter);

    // Audio Filter Chain zu FFmpeg Args hinzufügen
    if (audioFilters.length > 0) {
      ffmpegArgs.push("-af", audioFilters.join(","));
    }

    // Output format
    ffmpegArgs.push(
      "-f", "mp3",
      "-b:a", "128k",
      "pipe:1"
    );

    const ffmpegProcess = spawn("ffmpeg", ffmpegArgs, { stdio: ["ignore", "pipe", "pipe"] });
    
    this.currentDecoder = ffmpegProcess;  // Für Skip/Previous Kompatibilität
    this.currentEncoder = null;  // Nicht mehr benötigt (Single-Pass)
    this.currentProcessElapsedTime = 0;

    // MP3 Stream direkt zu Clients streamen
    ffmpegProcess.stdout.on("data", (mp3chunk) => {
      this.currentProcessElapsedTime = Math.floor((Date.now() - startTime) / 1000);
      
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

    ffmpegProcess.on("exit", onExit);
    ffmpegProcess.stderr.on("data", (chunk) => {
      // FFmpeg gibt loudnorm Stats in stderr aus - nur bei Fehlern loggen
      const msg = chunk.toString();
      if (msg.includes("error") || msg.includes("Error")) {
        console.error("[FFmpeg Error]", msg);
      }
    });
  }

  setVolume(percent) {
    const p = Number(percent) || 0;
    const clamped = Math.max(0, Math.min(200, Math.round(p)));
    this.volumePercent = clamped;
    this.currentVolumeMultiplier = clamped / 100;
    this.broadcastVolumeUpdate();

    // Bei laufendem Track: Neustart mit neuer Lautstärke
    // (FFmpeg kann Volume nicht live ändern bei unserem Setup)
    if (this.currentDecoder) {
      console.log(`[Volume] Setze Lautstärke auf ${clamped}%, starte Track neu...`);
      this._restartSame = true;
      try { 
        if (this.currentDecoder) this.currentDecoder.kill("SIGKILL"); 
      } catch (e) {}
    }
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
    
    // Bei laufendem Track: Neustart mit neuer Einstellung
    if (this.currentDecoder) {
      console.log(`[Monotone] Wende EBU R128 an, starte Track neu...`);
      this._restartSame = true;
      try { 
        if (this.currentDecoder) this.currentDecoder.kill("SIGKILL"); 
      } catch (e) {}
    }
  }

  setMonotoneReduceLoud(enabled) {
    this.monotoneReduceLoud = Boolean(enabled);
    console.log(`EBU R128 Reduce Loud Songs ${this.monotoneReduceLoud ? 'enabled' : 'disabled'}`);
    
    // Bei laufendem Track: Neustart mit neuer Einstellung
    if (this.currentDecoder && this.monotoneEnabled) {
      console.log(`[Monotone] Toggle Reduce Loud, starte Track neu...`);
      this._restartSame = true;
      try { 
        if (this.currentDecoder) this.currentDecoder.kill("SIGKILL"); 
      } catch (e) {}
    }
  }

  getSettings() {
    return {
      monotoneEnabled: this.monotoneEnabled,
      monotoneReduceLoud: this.monotoneReduceLoud
    };
  }
}

export const radio = new RadioEngine();