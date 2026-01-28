import express from "express";
import { radio } from "./RadioEngine.js";
import { authMiddleware } from "../middleware/AuthLogic.js";

const router = express.Router();

/* ==========================
   Protected Routes
========================== */

router.use(authMiddleware);

// GET /stream
router.get("/", (req, res) => {
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-cache");
  radio.addClient(res);
});

// Metadata endpoints
router.get("/meta/currentsong", (req, res) => res.json({ status: 200, message: "Displaying the metadata for the currently playing song", metadata: radio.getMeta() }));
router.get("/meta/queue", (req, res) => res.json({ status: 200, message: "Displaying the metadata for all songs in Queue", metadata: radio.getQueueState().queue }));

// Control Endpoints
router.get("/control/skip", (req, res) => { radio.skip(); res.json({ status: 200, message: "Song has been skipped" }); });
router.get("/control/previous", (req, res) => { radio.previous(); res.json({ status: 200, message: "Previous song will be played" }); });
router.get("/control/shuffle", (req, res) => { radio.shuffleRemaining(); res.json({ status: 200, message: "Queue shuffled" }); });
router.get("/control/jumpto/:index", (req, res) => { radio.jumpto(req.params.index); res.json({ status: 200, message: `Jumped to Song Index ${req.params.index}` }); });

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

export default router;