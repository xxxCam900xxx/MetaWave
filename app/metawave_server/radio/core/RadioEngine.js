/**
 * RadioEngine – Track-by-Track Player (Spotify-Jam-Style)
 *
 * Instead of one continuous ffmpeg stream, the engine manages a queue
 * and advances via a server-side timer based on each song's duration.
 * Clients load individual MP3 files, preload the next song, and stay in
 * sync via WebSocket `trackChanged` / `queueUpdated` messages.
 *
 * All queue-management features (shuffle, smartShuffle, artist-distance,
 * skip, previous, jumpto, LUFS settings) are preserved unchanged.
 */

import fs from "fs";
import path from "path";
import EventEmitter from "events";
import WebSocket from "ws";
import { getRadioSchedule, storeRadioSchedule } from "../database/DatabaseLogic.js";

const SONGS_DIR = path.resolve("/songs");
const METADATA_FILE = path.join(SONGS_DIR, "metadata.json");

export class RadioEngine extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.currentIndex = 0;
    this.wsClients = new Set();
    this.volumePercent = 100;
    this.monotoneEnabled = false;
    this.monotoneReduceLoud = false;
    this.minArtistDistance = 5;
    this.isPaused = false;
    this._pausedElapsed = 0;
    this.workSchedule = { enabled: false, startTime: "09:00", endTime: "17:00" };
    this._lastScheduleShouldPlay = null;
    this.lastQueueHash = null;
    this.cachedQueueState = null;

    // Timer-based track advancement
    this._trackStartedAt = Date.now();
    this._trackTimer = null;

    // Periodic metadata hot-reload: check every 30 s whether metadata.json changed
    // so that covers, durations and LUFS values become available without restart.
    this._metadataMtime = null;
    this._metadataReloadInterval = setInterval(() => this._checkMetadataReload(), 30_000);
    this._scheduleInterval = setInterval(() => this._applyWorkSchedule(), 30_000);

    this.loadQueue();
    this._loadWorkSchedule();
  }

  async _loadWorkSchedule() {
    try {
      this.workSchedule = await getRadioSchedule();
      this._applyWorkSchedule(true);
    } catch (err) {
      console.error("[RadioEngine] Arbeitszeiten konnten nicht geladen werden:", err);
    }
  }

  _isValidTime(value) {
    return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

  _shouldPlayForWorkSchedule(now = new Date()) {
    const { startTime, endTime } = this.workSchedule;
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;

    return start < end
      ? currentTime >= start && currentTime < end
      : currentTime >= start || currentTime < end;
  }

  _applyWorkSchedule(applyImmediately = false) {
    if (!this.workSchedule.enabled) {
      this._lastScheduleShouldPlay = null;
      return;
    }

    const shouldPlay = this._shouldPlayForWorkSchedule();
    if (applyImmediately || shouldPlay !== this._lastScheduleShouldPlay) {
      this._lastScheduleShouldPlay = shouldPlay;
      if (shouldPlay) this.resume("Arbeitszeit beginnt");
      else this.pause("Arbeitszeit endet");
    }
  }

  // ─── Hot-reload metadata ──────────────────────────────────────────────────

  _checkMetadataReload() {
    if (!fs.existsSync(METADATA_FILE)) return;
    try {
      const mtime = fs.statSync(METADATA_FILE).mtimeMs;
      if (this._metadataMtime === null) {
        // First check: just record mtime, don't reload (loadQueue already ran)
        this._metadataMtime = mtime;
        return;
      }
      if (mtime !== this._metadataMtime) {
        this._metadataMtime = mtime;
        console.log("[RadioEngine] metadata.json geändert – lade Metadaten nach...");
        this._reloadMetadata();
      }
    } catch (err) {
      console.error("[RadioEngine] Fehler beim Prüfen der Metadaten:", err);
    }
  }

  /**
   * Hot-reload: update metadata for existing queue items in-place,
   * and append any newly downloaded songs AFTER the current position.
   * Does NOT restart playback or reshuffle the current queue.
   */
  _reloadMetadata() {
    if (!fs.existsSync(METADATA_FILE)) return;
    try {
      const data = JSON.parse(fs.readFileSync(METADATA_FILE, "utf-8"));

      // Build a lookup by filename
      const byFilename = {};
      for (const s of data) {
        if (s?.filename) byFilename[s.filename] = s;
      }

      // 1. Update metadata for songs already in the queue
      let updated = 0;
      for (const song of this.queue) {
        const fresh = byFilename[song.filename];
        if (!fresh) continue;
        if (!song.title || song.title === song.filename) song.title = fresh.title || song.title;
        if (!song.author)  song.author  = fresh.author  || song.author;
        if (!song.cover)   song.cover   = fresh.cover   || song.cover;
        if (!song.duration) song.duration = fresh.duration || song.duration;
        if (!song.lufs && fresh.lufs && typeof fresh.lufs.input_i === "number") {
          song.lufs = fresh.lufs;
        }
        updated++;
      }

      // 2. Add new songs not yet in queue
      const inQueue = new Set(this.queue.map(s => s.filename));
      const newSongs = data
        .filter(s => s?.filename && !inQueue.has(s.filename) && fs.existsSync(path.join(SONGS_DIR, s.filename)))
        .map(s => ({
          filename: s.filename,
          title:    s.title    || s.filename,
          author:   s.author   || "",
          cover:    s.cover    || "",
          duration: s.duration || 0,
          lufs:     (s.lufs && typeof s.lufs.input_i === "number") ? s.lufs : null,
        }));

      if (newSongs.length > 0) {
        const shuffled = this.minArtistDistance === 0
          ? this._fisherYates([...newSongs])
          : this.smartShuffle(newSongs, this.queue[this.currentIndex]);
        // Insert after current position so playback isn't interrupted
        const insertPos = this.currentIndex + 1;
        this.queue.splice(insertPos, 0, ...shuffled);
        console.log(`[RadioEngine] ${newSongs.length} neue Songs in die Queue eingefügt`);
      }

      this.lastQueueHash = null;
      this.cachedQueueState = null;

      const songsWithLufs = this.queue.filter(s => s.lufs).length;
      console.log(`[RadioEngine] Metadaten aktualisiert: ${updated} Songs, ${newSongs.length} neu, ${songsWithLufs} mit LUFS`);

      // Notify all clients
      this._broadcastTrackChanged(); // sends fresh cover/duration for current song
      this.broadcastQueueUpdate();
    } catch (err) {
      console.error("[RadioEngine] Fehler beim Neuladen der Metadaten:", err);
    }
  }

  // ─── Queue Loading ─────────────────────────────────────────────────────────

  loadQueue() {
    if (!fs.existsSync(METADATA_FILE)) {
      console.warn("Keine Metadaten gefunden, lade nur Dateinamen");
      const files = fs.readdirSync(SONGS_DIR)
        .filter(f => f.endsWith(".mp3") && !f.endsWith(".info.mp3"));
      this.queue = files.map(f => ({ filename: f, title: f, duration: 0 }));
      console.log(`Queue loaded: ${this.queue.length} songs (no metadata)`);
      if (this.queue.length > 0) this._startTrack(0);
      return;
    }

    try {
      const data = JSON.parse(fs.readFileSync(METADATA_FILE, "utf-8"));
      this.queue = data
        .filter(s => s?.filename && fs.existsSync(path.join(SONGS_DIR, s.filename)) && !s.filename.endsWith(".info.mp3"))
        .map(s => ({
          filename: s.filename,
          title:    s.title    || s.filename,
          author:   s.author   || "",
          cover:    s.cover    || "",
          duration: s.duration || 0,
          lufs:     (s.lufs && typeof s.lufs.input_i === "number") ? s.lufs : null,
        }));
    } catch (err) {
      console.error("Fehler beim Laden der Metadaten:", err);
      this.queue = [];
    }

    const songsWithLufs = this.queue.filter(s => s.lufs).length;
    console.log(`Queue loaded: ${this.queue.length} songs (${songsWithLufs} with LUFS data)`);

    if (this.queue.length > 0) {
      // shuffleQueue calls _startTrack(0) internally
      this.shuffleQueue();
      console.log("Queue shuffled on initial load");
    }
  }

  // ─── Track Advancement ─────────────────────────────────────────────────────

  /**
   * Start playing (tracking) a specific queue index.
   * Sets up a server-side timer that fires when the song duration elapses.
   */
  _startTrack(index) {
    if (this._trackTimer) {
      clearTimeout(this._trackTimer);
      this._trackTimer = null;
    }

    if (!this.queue.length) return;

    index = ((index % this.queue.length) + this.queue.length) % this.queue.length;
    this.currentIndex = index;
    this._trackStartedAt = Date.now();
    this._pausedElapsed = 0;

    // Invalidate queue-state cache
    this.lastQueueHash = null;
    this.cachedQueueState = null;

    const song = this.queue[index];
    if (!song) return;

    console.log(`[RadioEngine] Now playing [${index}]: ${song.title} (${song.duration}s)`);

    if (this.monotoneEnabled && song.lufs) {
      const gainDb = this._calcLufsGain(song);
      console.log(`[LUFS] ${song.title}: ${song.lufs.input_i.toFixed(1)} LUFS → Gain: ${gainDb >= 0 ? "+" : ""}${gainDb.toFixed(1)} dB`);
    }

    // Broadcast to all connected WebSocket clients
    this._broadcastTrackChanged();
    this.broadcastQueueUpdate();

    // Auto-advance after duration (songs with duration=0 rely on client SONG_ENDED message)
    this._scheduleTrackAdvance(song.duration || 0);
  }

  _scheduleTrackAdvance(durationSeconds) {
    if (this.isPaused || durationSeconds <= 0) return;
    const remainingMs = Math.max(0, durationSeconds * 1000 - this._getElapsedMilliseconds());
    this._trackTimer = setTimeout(() => this._autoAdvance(), remainingMs);
  }

  _getElapsedMilliseconds() {
    return this.isPaused
      ? this._pausedElapsed * 1000
      : Date.now() - this._trackStartedAt;
  }

  _autoAdvance() {
    if (!this.queue.length || this.isPaused) return;
    const next = this.currentIndex + 1;
    if (next >= this.queue.length) {
      console.log("[RadioEngine] Ende der Queue – shuffle und von vorn");
      this.shuffleQueue(); // calls _startTrack(0)
      return;
    }
    this._startTrack(next);
  }

  /**
   * Called by WebSocket when a client reports the current song finished.
   * Used as fallback for songs without a known duration.
   */
  clientReportedSongEnded() {
    if (!this.isPaused && !this._trackTimer) {
      this._autoAdvance();
    }
  }

  // ─── LUFS helpers ──────────────────────────────────────────────────────────

  _calcLufsGain(song) {
    if (!song.lufs || typeof song.lufs.input_i !== "number") return 0;
    const targetLUFS = -14.0;
    let gainDb = targetLUFS - song.lufs.input_i;
    if (gainDb < 0 && !this.monotoneReduceLoud) gainDb = 0;
    return gainDb;
  }

  /**
   * Returns the linear gain multiplier for a song (clients use this to
   * apply software volume when monotone normalization is enabled).
   */
  getLufsGainMultiplier(song) {
    if (!this.monotoneEnabled) return 1;
    const gainDb = this._calcLufsGain(song);
    const mult = Math.pow(10, gainDb / 20);
    return isFinite(mult) && mult > 0 ? mult : 1;
  }

  // ─── File serving ──────────────────────────────────────────────────────────

  /** Returns the absolute path to an MP3 file – sanitised against path traversal */
  getSongFilePath(filename) {
    const safe = path.basename(filename);
    return path.join(SONGS_DIR, safe);
  }

  // ─── Meta / Queue state ────────────────────────────────────────────────────

  getMeta() {
    const song = this.queue[this.currentIndex];
    const elapsed   = Math.floor(this._getElapsedMilliseconds() / 1000);
    const duration  = song?.duration || 0;
    const lufsGainDb = song ? this._calcLufsGain(song) : 0;
    return {
      filename:        song?.filename || "",
      title:           song?.title    || "",
      author:          song?.author   || "",
      cover:           song?.cover    || "",
      duration,
      index:           this.currentIndex,
      total:           this.queue.length,
      elapsed:         duration > 0 ? Math.min(elapsed, duration) : elapsed,
      lufs:            song?.lufs    || null,
      lufsGainDb,
      monotoneEnabled: this.monotoneEnabled,
      isPaused:        this.isPaused,
    };
  }

  getQueueState() {
    const hash = `${this.currentIndex}_${this.queue.length}_${this.queue.map(s => s.filename).join(",")}`;
    if (this.lastQueueHash === hash && this.cachedQueueState) return this.cachedQueueState;

    const state = {
      nowPlayingIndex: this.currentIndex,
      nowPlaying:      this.queue[this.currentIndex]?.filename || "",
      queue: this.queue.map((song, index) => ({
        song:         song.filename,
        title:        song.title,
        author:       song.author,
        duration:     song.duration,
        cover:        song.cover,
        index,
        isPlaying:    index === this.currentIndex,
        hasBeenPlayed: typeof song.hasBeenPlayed === "boolean"
          ? song.hasBeenPlayed
          : index < this.currentIndex,
      })),
    };

    this.lastQueueHash = hash;
    this.cachedQueueState = state;
    return state;
  }

  getSettings() {
    return {
      monotoneEnabled:    this.monotoneEnabled,
      monotoneReduceLoud: this.monotoneReduceLoud,
      minArtistDistance:  this.minArtistDistance,
      isPaused:          this.isPaused,
      workSchedule:      this.workSchedule,
    };
  }

  // ─── Playback controls ─────────────────────────────────────────────────────

  pause(reason = "Manuell pausiert") {
    if (this.isPaused) return;
    this._pausedElapsed = Math.floor(this._getElapsedMilliseconds() / 1000);
    if (this._trackTimer) clearTimeout(this._trackTimer);
    this._trackTimer = null;
    this.isPaused = true;
    console.log(`[RadioEngine] Pausiert bei ${this._pausedElapsed}s: ${reason}`);
    this._broadcastPlaybackState();
    this._broadcastTrackChanged();
  }

  resume(reason = "Manuell fortgesetzt") {
    if (!this.isPaused) return;
    const song = this.queue[this.currentIndex];
    this._trackStartedAt = Date.now() - this._pausedElapsed * 1000;
    this.isPaused = false;
    this._scheduleTrackAdvance(song?.duration || 0);
    console.log(`[RadioEngine] Fortgesetzt bei ${this._pausedElapsed}s: ${reason}`);
    this._broadcastPlaybackState();
    this._broadcastTrackChanged();
  }

  togglePlayback() {
    if (this.isPaused) this.resume();
    else this.pause();
  }

  async setWorkSchedule({ enabled, startTime, endTime }) {
    if (typeof enabled !== "boolean" || !this._isValidTime(startTime) || !this._isValidTime(endTime) || startTime === endTime) {
      throw new Error("INVALID_WORK_SCHEDULE");
    }

    this.workSchedule = { enabled, startTime, endTime };
    await storeRadioSchedule(this.workSchedule);
    this._applyWorkSchedule(true);
    this.broadcastSettingsUpdate();
  }

  skip() {
    console.log("[RadioEngine] Skip requested");
    this._startTrack((this.currentIndex + 1) % this.queue.length);
  }

  previous() {
    if (!this.queue.length) return;
    console.log("[RadioEngine] Previous requested");
    const prev = this.currentIndex > 0 ? this.currentIndex - 1 : this.queue.length - 1;
    this._startTrack(prev);
  }

  jumpto(index) {
    const idx = Number(index);
    if (Number.isNaN(idx) || idx < 0 || idx >= this.queue.length) {
      console.warn("[RadioEngine] jumpto: invalid index", index);
      return;
    }
    if (idx === this.currentIndex) return;

    if (idx > this.currentIndex) {
      const played    = this.queue.slice(0, this.currentIndex + 1);
      const target    = this.queue[idx];
      const skipped   = this.queue.slice(this.currentIndex + 1, idx);
      const remaining = this.queue.slice(idx + 1);
      const leftovers = [...skipped, ...remaining];
      const shuffled  = this.minArtistDistance === 0
        ? this._fisherYates([...leftovers])
        : this.smartShuffle(leftovers, target);
      this.queue = [...played, target, ...shuffled];
      this.lastQueueHash = null;
      this.cachedQueueState = null;
      this._startTrack(played.length);
      return;
    }

    // Jump backward
    for (let i = 0; i < this.currentIndex; i++) {
      if (this.queue[i]) this.queue[i].hasBeenPlayed = true;
    }
    const target = this.queue[idx];
    if (!target) return;
    this.queue.splice(idx, 1);
    const insertPos = this.currentIndex;
    this.queue.splice(insertPos, 0, target);
    this.lastQueueHash = null;
    this.cachedQueueState = null;
    this._startTrack(insertPos);
  }

  /**
   * Move a queue item from one position to another.
   * Adjusts currentIndex so the active song continues playing unchanged.
   */
  moveInQueue(from, to) {
    from = Math.round(Number(from));
    to   = Math.round(Number(to));
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return;
    if (from < 0 || from >= this.queue.length) return;
    if (to   < 0 || to   >= this.queue.length) return;

    const [item] = this.queue.splice(from, 1);
    this.queue.splice(to, 0, item);

    // Keep currentIndex pointing at the same (now-playing) song
    if (from === this.currentIndex) {
      this.currentIndex = to;
    } else if (from < this.currentIndex && to >= this.currentIndex) {
      this.currentIndex--;
    } else if (from > this.currentIndex && to <= this.currentIndex) {
      this.currentIndex++;
    }

    this.lastQueueHash   = null;
    this.cachedQueueState = null;
    console.log(`[RadioEngine] Moved queue item ${from} → ${to}, currentIndex=${this.currentIndex}`);
    this.broadcastQueueUpdate();
  }

  setVolume(percent) {
    this.volumePercent = Math.max(0, Math.min(200, Math.round(Number(percent) || 0)));
    this.broadcastVolumeUpdate();
  }

  setMonotoneEnabled(enabled) {
    this.monotoneEnabled = Boolean(enabled);
    console.log(`[RadioEngine] EBU R128: ${this.monotoneEnabled ? "an" : "aus"}`);
    this.broadcastSettingsUpdate();
    this._broadcastTrackChanged(); // clients re-apply gain
  }

  setMonotoneReduceLoud(enabled) {
    this.monotoneReduceLoud = Boolean(enabled);
    console.log(`[RadioEngine] Reduce loud: ${this.monotoneReduceLoud ? "an" : "aus"}`);
    this.broadcastSettingsUpdate();
    this._broadcastTrackChanged();
  }

  setMinArtistDistance(distance) {
    this.minArtistDistance = Math.max(0, Number(distance) || 0);
    this.broadcastSettingsUpdate();
  }

  // ─── Shuffle ───────────────────────────────────────────────────────────────

  shuffleQueue() {
    this.queue = this.minArtistDistance === 0
      ? this._fisherYates([...this.queue])
      : this.smartShuffle(this.queue);
    this.lastQueueHash = null;
    this.cachedQueueState = null;
    this._startTrack(0);
  }

  shuffleRemaining() {
    const played    = this.queue.slice(0, this.currentIndex + 1);
    const remaining = this.queue.slice(this.currentIndex + 1);
    const shuffled  = this.minArtistDistance === 0
      ? this._fisherYates([...remaining])
      : this.smartShuffle(remaining, played[played.length - 1]);
    this.queue = [...played, ...shuffled];
    this.lastQueueHash = null;
    this.cachedQueueState = null;
    this.broadcastQueueUpdate();
  }

  _fisherYates(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ─── WebSocket clients ─────────────────────────────────────────────────────

  addWSClient(ws) {
    this.wsClients.add(ws);
    ws.on("close", () => this.wsClients.delete(ws));
  }

  // ─── Broadcast helpers ─────────────────────────────────────────────────────

  _broadcastTrackChanged() {
    const meta    = this.getMeta();
    const payload = JSON.stringify({ type: "trackChanged", meta });
    for (const ws of this.wsClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
    this.emit("meta", meta);
  }

  _broadcastPlaybackState() {
    const payload = JSON.stringify({ type: "playbackStateChanged", meta: this.getMeta() });
    for (const ws of this.wsClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  broadcastQueueUpdate() {
    const payload = JSON.stringify({ type: "queueUpdated", queue: this.getQueueState() });
    for (const ws of this.wsClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  broadcastVolumeUpdate() {
    const payload = JSON.stringify({ type: "volumeChanged", volume: this.volumePercent });
    for (const ws of this.wsClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  broadcastSettingsUpdate() {
    const payload = JSON.stringify({ type: "settingsUpdated", settings: this.getSettings() });
    for (const ws of this.wsClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  // ─── Smart Shuffle (artist distance) ──────────────────────────────────────

  smartShuffle(songs, lastPlayedSong = null) {
    if (!songs || songs.length === 0) return [];
    if (songs.length === 1) return [...songs];

    const shuffled  = this._fisherYates([...songs]);
    const result    = [];
    const remaining = [...shuffled];
    const context   = lastPlayedSong ? [lastPlayedSong] : [];

    while (remaining.length > 0) {
      let placed = false;
      for (let i = 0; i < remaining.length; i++) {
        const testQueue = [...context, ...result];
        if (this.canPlayArtistAt(testQueue, testQueue.length, remaining[i])) {
          result.push(remaining.splice(i, 1)[0]);
          placed = true;
          break;
        }
      }
      if (!placed) {
        let bestIndex = 0;
        let bestScore = -1;
        const testQueue = [...context, ...result];
        for (let i = 0; i < remaining.length; i++) {
          let lastOcc = -1;
          for (let j = testQueue.length - 1; j >= 0; j--) {
            if (this.isSameArtist(testQueue[j], remaining[i])) { lastOcc = j; break; }
          }
          const dist = lastOcc === -1 ? Infinity : testQueue.length - lastOcc;
          if (dist > bestScore || (dist === bestScore && Math.random() > 0.5)) {
            bestScore = dist;
            bestIndex = i;
          }
        }
        result.push(remaining.splice(bestIndex, 1)[0]);
      }
    }
    return result;
  }

  canPlayArtistAt(queue, position, candidate) {
    if (this.minArtistDistance <= 0) return true;
    const start = Math.max(0, position - this.minArtistDistance);
    for (let i = start; i < position; i++) {
      if (queue[i] && this.isSameArtist(queue[i], candidate)) return false;
    }
    return true;
  }

  isSameArtist(a, b) {
    return this.extractArtistIdentifiers(a).some(id => this.extractArtistIdentifiers(b).includes(id));
  }

  normalizeArtistName(artist) {
    if (!artist) return "";
    return artist
      .toLowerCase()
      .replace(/\s*[\(\[]?(feat|ft|featuring|with)[.\s]*[^\)\]]*[\)\]]?/gi, "")
      .replace(/\s*&\s*/g, " ")
      .trim();
  }

  extractArtistIdentifiers(song) {
    const ids = [];
    const push = n => { if (n && !ids.includes(n)) ids.push(n); };
    if (song.author) push(this.normalizeArtistName(song.author));
    if (song.title) {
      const t = song.title;
      const dash    = t.match(/^([^-]+)\s*-\s*.+$/);
      if (dash)    push(this.normalizeArtistName(dash[1]));
      const bracket = t.match(/^[\[\(]([^\]\)]+)[\]\)]\s*.+$/);
      if (bracket) push(this.normalizeArtistName(bracket[1]));
      const colon   = t.match(/^([^:]+)\s*:\s*.+$/);
      if (colon)   push(this.normalizeArtistName(colon[1]));
    }
    return ids;
  }
}

export const radio = new RadioEngine();
