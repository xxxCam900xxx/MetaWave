import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import EventEmitter from "events";

const SONGS_DIR = path.resolve("/songs");

export class RadioEngine extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.currentIndex = 0;
    this.currentProcess = null;
    this.clients = new Set();
    this.loadQueue();
    this.playNext();
  }

  loadQueue() {
    const files = fs.readdirSync(SONGS_DIR).filter(f => f.endsWith(".mp3"));
    this.queue = files;
    console.log("Queue loaded:", this.queue);
  }

  playNext() {
    if (!this.queue.length) {
      setTimeout(() => this.playNext(), 2000);
      return;
    }

    const song = this.queue[this.currentIndex];
    console.log("Now playing:", song);
    this.emit("meta", this.getMeta());

    const ffmpegArgs = [
      "-re",
      "-i", path.join(SONGS_DIR, song),
      "-f", "mp3",
      "-b:a", "128k",
      "-content_type", "audio/mpeg",
      "pipe:1"
    ];

    this.currentProcess = spawn("ffmpeg", ffmpegArgs);

    this.currentProcess.stdout.on("data", chunk => {
      for (const res of this.clients) {
        res.write(chunk);
      }
    });

    this.currentProcess.stderr.on("data", chunk => {});

    this.currentProcess.on("exit", () => {
      this.currentIndex = (this.currentIndex + 1) % this.queue.length;
      this.playNext();
    });
  }

  addClient(res) {
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));
  }

  skip() {
    if (this.currentProcess) {
      console.log("Skip requested");
      this.currentProcess.kill("SIGKILL");
    }
  }

  getMeta() {
    return {
      song: this.queue[this.currentIndex],
      index: this.currentIndex,
      total: this.queue.length
    };
  }
}