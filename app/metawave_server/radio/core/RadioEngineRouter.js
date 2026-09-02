import express from "express";
import fs from "fs";
import path from "path";
import { radio } from "./RadioEngine.js";
import { authMiddleware } from "../middleware/AuthLogic.js";

const router = express.Router();

/* ==========================
   Protected Routes
========================== */

router.use(authMiddleware);

// GET /stream/file/:filename
// Serves an individual MP3 file from the songs volume.
// Clients use this endpoint to load the current and next song.
router.get("/file/:filename", (req, res) => {
  const filePath = radio.getSongFilePath(req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ status: 404, message: "File not found" });
  }
  const stat = fs.statSync(filePath);
  const range = req.headers.range;

  // Support HTTP Range requests (needed for seek / preloading on some clients)
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end   = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    if (start >= stat.size) {
      return res.status(416).setHeader("Content-Range", `bytes */${stat.size}`).end();
    }
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      "Content-Range":  `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges":  "bytes",
      "Content-Length": chunkSize,
      "Content-Type":   "audio/mpeg",
      "Cache-Control":  "no-cache",
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": stat.size,
      "Content-Type":   "audio/mpeg",
      "Accept-Ranges":  "bytes",
      "Cache-Control":  "no-cache",
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// GET /stream/prefetch  – returns next song metadata so the client can preload
router.get("/prefetch", (req, res) => {
  const nextIndex = (radio.currentIndex + 1) % radio.queue.length;
  const song = radio.queue[nextIndex];
  if (!song) return res.json({ status: 200, next: null });
  res.setHeader("Cache-Control", "public, max-age=2");
  res.json({
    status: 200,
    next: {
      filename: song.filename,
      title:    song.title,
      author:   song.author,
      cover:    song.cover,
      duration: song.duration,
      index:    nextIndex,
    },
  });
});

// Metadata endpoints
router.get("/meta/currentsong", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=2, stale-while-revalidate=5");
  res.json({ status: 200, message: "Displaying the metadata for the currently playing song", metadata: radio.getMeta() });
});

router.get("/meta/queue", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3, stale-while-revalidate=10");
  res.json({ status: 200, message: "Displaying the metadata for all songs in Queue", metadata: radio.getQueueState().queue });
});

// Control Endpoints
router.post("/control/playback", (req, res) => {
  const { paused } = req.body;
  if (typeof paused !== "boolean") return res.status(400).json({ status: 400, message: "Invalid paused value" });
  if (paused) radio.pause();
  else radio.resume();
  return res.json({ status: 200, paused: radio.isPaused, metadata: radio.getMeta() });
});

router.post("/control/playback/toggle", (req, res) => {
  radio.togglePlayback();
  return res.json({ status: 200, paused: radio.isPaused, metadata: radio.getMeta() });
});

router.get("/control/skip", (req, res) => { radio.skip(); res.json({ status: 200, message: "Song has been skipped" }); });
router.get("/control/previous", (req, res) => { radio.previous(); res.json({ status: 200, message: "Previous song will be played" }); });
router.get("/control/shuffle", (req, res) => { radio.shuffleRemaining(); res.json({ status: 200, message: "Queue shuffled" }); });
router.get("/control/jumpto/:index", (req, res) => { radio.jumpto(req.params.index); res.json({ status: 200, message: `Jumped to Song Index ${req.params.index}` }); });
router.get("/control/move/:from/:to", (req, res) => { radio.moveInQueue(req.params.from, req.params.to); res.json({ status: 200, message: `Moved queue item from ${req.params.from} to ${req.params.to}` }); });

// Volume control endpoints
router.get("/control/sound/:percentage", (req, res) => {
  const pct = Number(req.params.percentage);
  if (Number.isNaN(pct)) return res.status(400).json({ status: 400, message: "Invalid percentage" });
  radio.setVolume(pct);
  return res.json({ status: 200, message: `Volume set to ${radio.volumePercent}%`, volume: radio.volumePercent });
});

router.get("/control/volume", (req, res) => {
  return res.json({ status: 200, volume: radio.volumePercent });
});

// Settings endpoints
router.get("/settings", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=5, stale-while-revalidate=10");
  return res.json({ status: 200, ...radio.getSettings() });
});

router.post("/settings/monotone", (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ status: 400, message: "Invalid enabled value" });
  }
  radio.setMonotoneEnabled(enabled);
  return res.json({ 
    status: 200, 
    message: `EBU R128 Loudness Normalization ${enabled ? 'enabled' : 'disabled'}`, 
    monotoneEnabled: radio.monotoneEnabled 
  });
});

router.post("/settings/monotone/reduce-loud", (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ status: 400, message: "Invalid enabled value" });
  }
  radio.setMonotoneReduceLoud(enabled);
  return res.json({ 
    status: 200, 
    message: `EBU R128 Reduce Loud Songs ${enabled ? 'enabled' : 'disabled'}`, 
    monotoneReduceLoud: radio.monotoneReduceLoud 
  });
});

router.post("/settings/artist-distance", (req, res) => {
  const { distance } = req.body;
  if (typeof distance !== "number" || distance < 0) {
    return res.status(400).json({ status: 400, message: "Invalid distance value. Must be a non-negative number." });
  }
  radio.setMinArtistDistance(distance);
  return res.json({ 
    status: 200, 
    message: `Minimum artist distance set to ${radio.minArtistDistance} songs`, 
    minArtistDistance: radio.minArtistDistance 
  });
});

router.post("/settings/work-schedule", async (req, res) => {
  try {
    await radio.setWorkSchedule(req.body);
    return res.json({ status: 200, ...radio.getSettings() });
  } catch (err) {
    if (err.message === "INVALID_WORK_SCHEDULE") {
      return res.status(400).json({ status: 400, message: "Arbeitszeit muss einen gültigen Start und ein gültiges Ende im Format HH:MM haben." });
    }
    console.error("Failed to save work schedule:", err);
    return res.status(500).json({ status: 500, message: "Arbeitszeit konnte nicht gespeichert werden." });
  }
});

export default router;