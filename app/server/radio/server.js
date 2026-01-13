import express from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const app = express();
const SONGS_DIR = "/songs";

function getRandomSong() {
  const files = fs.readdirSync(SONGS_DIR).filter(f => f.endsWith(".mp3"));
  return files[Math.floor(Math.random() * files.length)];
}

app.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "audio/mpeg");

  const song = getRandomSong();
  const ffmpeg = spawn("ffmpeg", [
    "-i", path.join(SONGS_DIR, song),
    "-f", "mp3",
    "-"
  ]);

  ffmpeg.stdout.pipe(res);
});

app.listen(8000, () => {
  console.log("MetaWave Radio läuft auf Port 8000");
});