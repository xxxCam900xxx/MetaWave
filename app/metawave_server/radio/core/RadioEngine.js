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
    this.minArtistDistance = 5; // Minimum number of songs between same artist
    this.lastGainWasZero = false; // Track if last song had zero gain (for logging)
    this.lastQueueHash = null; // Cache Hash für Queue-State
    this.cachedQueueState = null; // Gecachter Queue-State
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
          duration: s.duration || 0,
          lufs: s.lufs || null  // LUFS Daten für Normalisierung
        }));
    } catch (err) {
      console.error("Fehler beim Laden der Metadaten:", err);
      this.queue = [];
    }

    console.log("Queue loaded:", this.queue.map(s => s.title));
    
    // Log LUFS status
    const songsWithLufs = this.queue.filter(s => s.lufs && s.lufs.input_i).length;
    console.log(`LUFS Data: ${songsWithLufs}/${this.queue.length} songs have LUFS information`);
    
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
        const targetLUFS = -14.0;
        const currentLUFS = song.lufs.input_i;
        let gainDb = targetLUFS - currentLUFS; // positive => boost, negative => reduce
        if (gainDb < 0 && !this.monotoneReduceLoud) gainDb = 0;
        monoMult = Math.pow(10, gainDb / 20);
      }
      return vol * monoMult;
    };

    // LUFS Status einmal pro Song loggen
    if (this.monotoneEnabled && song.lufs) {
      const targetLUFS = -14.0;
      const currentLUFS = song.lufs.input_i;
      let gainDb = targetLUFS - currentLUFS;
      if (gainDb < 0 && !this.monotoneReduceLoud) gainDb = 0;
      
      if (gainDb !== 0) {
        console.log(`[LUFS] ${song.title}: ${currentLUFS.toFixed(1)} LUFS → Gain: ${gainDb > 0 ? '+' : ''}${gainDb.toFixed(1)} dB`);
      } else {
        console.log(`[LUFS] ${song.title}: ${currentLUFS.toFixed(1)} LUFS → Already at target, no gain needed`);
      }
    } else if (this.monotoneEnabled && !song.lufs) {
      console.warn(`[LUFS] ${song.title}: No LUFS data - normalization skipped`);
    }

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

      // Cache invalidieren weil currentIndex sich geändert hat
      this.lastQueueHash = null;
      this.cachedQueueState = null;

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

    // Only attach exit handler to decoder to prevent double-triggering
    // Encoder will be cleaned up when decoder exits
    decoder.on("exit", onExit);
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
    if (this.minArtistDistance === 0) {
      // Standard Fisher-Yates shuffle if artist distance is disabled
      for (let i = this.queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
      }
    } else {
      // Smart shuffle with artist distance
      this.queue = this.smartShuffle(this.queue);
    }
    // Cache invalidieren
    this.lastQueueHash = null;
    this.cachedQueueState = null;
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
      try { 
        if (this.currentDecoder) this.currentDecoder.kill("SIGKILL"); 
        if (this.currentEncoder) this.currentEncoder.kill("SIGKILL");
      } catch (e) {}
    }
  }

  previous() {
    if (!this.queue.length) return;

    console.log("Previous requested");

    const targetIndex = this.currentIndex > 0 ? this.currentIndex - 1 : Math.max(0, this.queue.length - 1);

    if (this.currentDecoder) {
      this.currentIndex = targetIndex - 1;
      try { 
        if (this.currentDecoder) this.currentDecoder.kill("SIGKILL"); 
        if (this.currentEncoder) this.currentEncoder.kill("SIGKILL");
      } catch (e) {}
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

    // Wenn nach vorne gesprungen wird: Songs dazwischen wieder in die Rest-Queue packen
    // und neu shuffeln, damit sie später wieder vorkommen.
    if (idx > this.currentIndex) {
      const played = this.queue.slice(0, this.currentIndex + 1);
      const target = this.queue[idx];
      const skipped = this.queue.slice(this.currentIndex + 1, idx);
      const remaining = this.queue.slice(idx + 1);

      const leftovers = [...skipped, ...remaining];

      // Smart shuffle for the remaining songs respecting artist distance
      let shuffledLeftovers;
      if (this.minArtistDistance === 0) {
        // Standard Fisher-Yates Shuffle if artist distance is disabled
        shuffledLeftovers = [...leftovers];
        for (let i = shuffledLeftovers.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledLeftovers[i], shuffledLeftovers[j]] = [shuffledLeftovers[j], shuffledLeftovers[i]];
        }
      } else {
        // Use smart shuffle considering the target song as the last played
        shuffledLeftovers = this.smartShuffle(leftovers, target);
      }

      this.queue = [...played, target, ...shuffledLeftovers];
      
      // Cache invalidieren weil Queue sich geändert hat
      this.lastQueueHash = null;
      this.cachedQueueState = null;
      
      // Der gewünschte Song ist jetzt an Position played.length
      const newIndex = played.length;
      
      if (this.currentDecoder) {
        // Setze auf newIndex - 1, damit nach dem ++ im exit handler newIndex erreicht wird
        this.currentIndex = newIndex - 1;
        try { 
          if (this.currentDecoder) this.currentDecoder.kill("SIGKILL"); 
          if (this.currentEncoder) this.currentEncoder.kill("SIGKILL");
        } catch (e) {}
      } else {
        // Kein laufender Song, direkt abspielen
        this.currentIndex = newIndex;
        this.playNext();
      }
      
      this.broadcastQueueUpdate();
      return;
    }
    
    // Wenn zurück gesprungen wird
    if (idx < this.currentIndex) {
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

      // Cache invalidieren weil Queue sich geändert hat
      this.lastQueueHash = null;
      this.cachedQueueState = null;

      if (this.currentDecoder) {
        this.currentIndex = newCurrent;
        try { 
          if (this.currentDecoder) this.currentDecoder.kill("SIGKILL"); 
          if (this.currentEncoder) this.currentEncoder.kill("SIGKILL");
        } catch (e) {}
      } else {
        this.currentIndex = insertPos;
        this.playNext();
      }

      this.broadcastQueueUpdate();
      return;
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
      elapsed: this.currentProcessElapsedTime || 0
    };
  }

  getQueueState() {
    // Erstelle einen Hash aus relevanten Queue-Informationen
    const queueHash = `${this.currentIndex}_${this.queue.length}_${this.queue.map(s => s.filename).join(',')}`;
    
    // Nutze gecachten State wenn Queue sich nicht geändert hat
    if (this.lastQueueHash === queueHash && this.cachedQueueState) {
      // Update nur die sich ändernden Felder (elapsed time)
      return this.cachedQueueState;
    }
    
    // Erstelle neuen Queue-State
    const queueState = {
      nowPlayingIndex: this.currentIndex,
      nowPlaying: this.queue[this.currentIndex]?.filename || "",
      queue: this.queue.map((song, index) => ({
        song: song.filename,
        title: song.title,
        author: song.author,
        duration: song.duration,
        // Cover-URL nur einmal senden, nicht bei jedem Update
        cover: song.cover,
        index,
        isPlaying: index === this.currentIndex,
        hasBeenPlayed: (typeof song.hasBeenPlayed === "boolean") ? song.hasBeenPlayed : (index < this.currentIndex)
      }))
    };
    
    // Cache speichern
    this.lastQueueHash = queueHash;
    this.cachedQueueState = queueState;
    
    return queueState;
  }

  shuffleRemaining() {
    const played = this.queue.slice(0, this.currentIndex + 1);
    const remaining = this.queue.slice(this.currentIndex + 1);

    if (this.minArtistDistance === 0) {
      // Standard Fisher-Yates shuffle if artist distance is disabled
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
    } else {
      // Smart shuffle with artist distance, considering last played song
      const shuffled = this.smartShuffle(remaining, played[played.length - 1]);
      this.queue = [...played, ...shuffled];
      // Cache invalidieren
      this.lastQueueHash = null;
      this.cachedQueueState = null;
      this.broadcastQueueUpdate();
      return;
    }

    this.queue = [...played, ...remaining];
    // Cache invalidieren
    this.lastQueueHash = null;
    this.cachedQueueState = null;
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
    
    // Log LUFS availability when enabling
    if (this.monotoneEnabled) {
      const songsWithLufs = this.queue.filter(s => s.lufs && s.lufs.input_i).length;
      console.log(`LUFS Data: ${songsWithLufs}/${this.queue.length} songs have LUFS information`);
    }
    
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
      monotoneReduceLoud: this.monotoneReduceLoud,
      minArtistDistance: this.minArtistDistance
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

  /**
   * Smart shuffle algorithm that respects minimum artist distance
   * Uses a greedy placement strategy for optimal artist spacing
   * @param {Array} songs - Songs to shuffle
   * @param {Object} lastPlayedSong - Optional: Last song that was played (to consider its artist)
   * @returns {Array} Shuffled songs respecting artist distance
   */
  smartShuffle(songs, lastPlayedSong = null) {
    if (!songs || songs.length === 0) return [];
    if (songs.length === 1) return songs;

    // First, do a standard shuffle
    const shuffled = [...songs];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Now apply greedy artist distance optimization
    const result = [];
    const remaining = [...shuffled];

    // If we have a last played song, consider it for the first placement
    const context = lastPlayedSong ? [lastPlayedSong] : [];

    while (remaining.length > 0) {
      let placed = false;

      // Try to find a song that respects artist distance
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        const testQueue = [...context, ...result];
        
        if (this.canPlayArtistAt(testQueue, testQueue.length, candidate)) {
          result.push(candidate);
          remaining.splice(i, 1);
          placed = true;
          break;
        }
      }

      // If no song can be placed respecting the distance, find the best position
      if (!placed) {
        // Calculate artist distance score for each remaining song
        // Lower score = better (artist appears less recently)
        let bestIndex = 0;
        let bestScore = -1; // Changed to -1 to prefer maximum distance

        for (let i = 0; i < remaining.length; i++) {
          const candidate = remaining[i];
          
          // Find distance to last occurrence of this artist
          let lastOccurrence = -1;
          const testQueue = [...context, ...result];
          for (let j = testQueue.length - 1; j >= 0; j--) {
            if (this.isSameArtist(testQueue[j], candidate)) {
              lastOccurrence = j;
              break;
            }
          }

          const distance = lastOccurrence === -1 ? Infinity : testQueue.length - lastOccurrence;
          
          // Prefer songs with greater distance from last occurrence
          if (distance > bestScore) {
            bestScore = distance;
            bestIndex = i;
          } else if (distance === bestScore && Math.random() > 0.5) {
            bestIndex = i;
          }
        }

        // Place the best candidate
        result.push(remaining[bestIndex]);
        remaining.splice(bestIndex, 1);
      }
    }

    return result;
  }

  /**
   * Normalize artist name for comparison
   * Handles features, collaborations, etc.
   */
  normalizeArtistName(artist) {
    if (!artist) return "";
    return artist
      .toLowerCase()
      .replace(/\s*[\(\[]?(feat|ft|featuring|with)[.\s]*[^\)\]]*[\)\]]?/gi, "")
      .replace(/\s*&\s*/g, " ")
      .trim();
  }

  /**
   * Extract artist identifiers from a song (both from author field and title)
   * Returns array of normalized artist names
   */
  extractArtistIdentifiers(song) {
    const identifiers = [];
    
    // Add author field if available
    if (song.author) {
      const normalized = this.normalizeArtistName(song.author);
      if (normalized) identifiers.push(normalized);
    }
    
    // Try to extract artist from title
    // Common patterns: "Artist - Song", "[Artist] Song", "Artist: Song"
    if (song.title) {
      const title = song.title;
      
      // Pattern: "Artist - Song"
      const dashMatch = title.match(/^([^-]+)\s*-\s*.+$/);
      if (dashMatch) {
        const normalized = this.normalizeArtistName(dashMatch[1]);
        if (normalized && !identifiers.includes(normalized)) {
          identifiers.push(normalized);
        }
      }
      
      // Pattern: "[Artist] Song" or "(Artist) Song"
      const bracketMatch = title.match(/^[\[\(]([^\]\)]+)[\]\)]\s*.+$/);
      if (bracketMatch) {
        const normalized = this.normalizeArtistName(bracketMatch[1]);
        if (normalized && !identifiers.includes(normalized)) {
          identifiers.push(normalized);
        }
      }
      
      // Pattern: "Artist: Song" or "Artist : Song"
      const colonMatch = title.match(/^([^:]+)\s*:\s*.+$/);
      if (colonMatch) {
        const normalized = this.normalizeArtistName(colonMatch[1]);
        if (normalized && !identifiers.includes(normalized)) {
          identifiers.push(normalized);
        }
      }
    }
    
    return identifiers;
  }

  /**
   * Set minimum artist distance
   */
  setMinArtistDistance(distance) {
    const d = Number(distance);
    if (Number.isNaN(d) || d < 0) {
      console.warn("Invalid artist distance:", distance);
      return;
    }
    this.minArtistDistance = Math.round(d);
    console.log(`Minimum artist distance set to ${this.minArtistDistance} songs`);
    this.broadcastSettingsUpdate();
  }

  /**
   * Check if two songs are from the same artist (comparing both author field and title)
   */
  isSameArtist(song1, song2) {
    if (!song1 || !song2) return false;
    
    const identifiers1 = this.extractArtistIdentifiers(song1);
    const identifiers2 = this.extractArtistIdentifiers(song2);
    
    // Check if any identifier from song1 matches any from song2
    for (const id1 of identifiers1) {
      for (const id2 of identifiers2) {
        if (id1 === id2) return true;
      }
    }
    
    return false;
  }

  /**
   * Check if artist can be played at given position
   * Returns true if there are no conflicts with minArtistDistance
   */
  canPlayArtistAt(queue, position, candidateSong) {
    if (!candidateSong || this.minArtistDistance === 0) return true;
    
    const candidateIdentifiers = this.extractArtistIdentifiers(candidateSong);
    if (candidateIdentifiers.length === 0) return true;

    // Check backward
    const checkStart = Math.max(0, position - this.minArtistDistance);
    for (let i = checkStart; i < position; i++) {
      if (this.isSameArtist(queue[i], candidateSong)) {
        return false;
      }
    }

    // Check forward
    const checkEnd = Math.min(queue.length, position + this.minArtistDistance + 1);
    for (let i = position + 1; i < checkEnd; i++) {
      if (this.isSameArtist(queue[i], candidateSong)) {
        return false;
      }
    }

    return true;
  }
}

export const radio = new RadioEngine();