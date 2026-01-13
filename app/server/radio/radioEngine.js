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

    this.loadQueue();
    this.waitForSongsAndStart();
  }

  waitForSongsAndStart() {
    if (this.queue.length === 0) {
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
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  playCurrent() {
    const song = this.queue[this.index];
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
        client.write(chunk);
      }
    });

    this.ffmpeg.on("exit", () => {
      this.handleSongEnd();
    });
  }

  handleSongEnd() {
    // Song ist zu Ende oder bewusst geskippt
    this.index++;

    if (this.index >= this.queue.length) {
      this.loadQueue();
    }

    this.playCurrent();
  }

  skip() {
    if (!this.ffmpeg) return;

    console.log("Skip requested");
    this.isSkipping = true;
    this.ffmpeg.kill("SIGKILL");
  }

  addClient(res) {
    this.clients.add(res);
    res.on("close", () => {
      this.clients.delete(res);
    });
  }
}