import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const SONGS_DIR = "/songs";

export class RadioEngine {
  constructor() {
    this.clients = new Set();
    this.queue = [];
    this.index = 0;
    this.ffmpeg = null;
    this.isSkipping = false;
    this.currentSong = null;
    this.metaListeners = new Set();

    this.loadQueue();
    this.waitForSongsAndStart();
  }

  waitForSongsAndStart() {
    if (this.queue.length === 0) {
      console.log("Keine Songs gefunden, warte auf neue Lieder...");
      setTimeout(() => {
        this.loadQueue();
        this.waitForSongsAndStart();
      }, 2000);
      return;
    }
    this.playCurrent();
  }

  loadQueue() {
    const files = fs.readdirSync(SONGS_DIR).filter(f => f.endsWith(".mp3"));
    if (files.length === 0) return;

    this.queue = this.shuffle(files);
    this.index = 0;
    console.log("Queue geladen:", this.queue);
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  playCurrent() {
    if (this.queue.length === 0) return;

    const song = this.queue[this.index];
    this.currentSong = song;
    console.log("Now playing:", song);

    this.isSkipping = false;

    this.ffmpeg = spawn("ffmpeg", [
      "-re",
      "-i", path.join(SONGS_DIR, song),
      "-f", "mp3",
      "-"
    ]);

    this.ffmpeg.stdout.on("data", chunk => {
      for (const client of this.clients) {
        try { client.write(chunk); } catch {}
      }
    });

    this.ffmpeg.on("exit", () => {
      if (!this.isSkipping) {
        this.handleSongEnd();
      }
    });

    this.emitMeta();
  }

  handleSongEnd() {
    this.index++;

    if (this.index >= this.queue.length) {
      this.loadQueue();
    }

    if (this.queue.length > 0) {
      this.playCurrent();
    } else {
      console.log("Keine Songs gefunden, warte auf neue Lieder...");
      setTimeout(() => this.waitForSongsAndStart(), 2000);
    }
  }

  skip() {
    if (!this.ffmpeg) return;

    console.log("Skip requested");
    this.isSkipping = true;

    this.ffmpeg.once("exit", () => {
      this.playCurrent();
    });

    this.ffmpeg.kill("SIGINT");
  }

  getMeta() {
    return {
      song: this.currentSong,
      index: this.index,
      total: this.queue.length
    };
  }

  onMetaUpdate(fn) {
    this.metaListeners.add(fn);
  }

  emitMeta() {
    const meta = this.getMeta();
    for (const fn of this.metaListeners) {
      try { fn(meta); } catch {}
    }
  }

  addClient(res) {
    this.clients.add(res);
    res.on("close", () => {
      this.clients.delete(res);
    });
  }
}