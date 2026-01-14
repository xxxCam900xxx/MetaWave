import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import EventEmitter from "events";
import WebSocket from "ws";

const SONGS_DIR = path.resolve("/songs");

export class RadioEngine extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.currentIndex = 0;
    this.currentProcess = null;
    this.clients = new Set();   // HTTP Clients für /stream
    this.wsClients = new Set(); // WebSocket Clients
    this.loadQueue();
    this.playNext();
  }

  loadQueue() {
    const files = fs.readdirSync(SONGS_DIR).filter(f => f.endsWith(".mp3"));
    this.queue = files;
    console.log("Queue loaded:", this.queue);
  }

  playNext() {
    if (!this.queue.length) return;

    const song = this.queue[this.currentIndex];
    console.log("Now playing:", song);
    this.emit("meta", this.getMeta());

    // ffmpeg Stream starten
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
      // HTTP Clients
      for (const res of this.clients) {
        res.write(chunk);
      }
      // WS Clients
      for (const ws of this.wsClients) {
        if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
      }
    });

    this.currentProcess.stderr.on("data", () => {}); // Ignorieren

    this.currentProcess.on("exit", () => {
      this.currentIndex = (this.currentIndex + 1) % this.queue.length;
      // Track Change Event an WS Clients senden
      const meta = this.getMeta();
      for (const ws of this.wsClients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "trackChanged", meta }));
        }
      }
      this.playNext();
    });
  }

  addClient(res) {
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));
  }

  addWSClient(ws) {
    this.wsClients.add(ws);
    ws.on("close", () => this.wsClients.delete(ws));
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