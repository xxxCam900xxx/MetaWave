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

// Control endpoints (support GET for client convenience)
router.get("/control/skip", (req, res) => { radio.skip(); res.json({ status: 200, message: "Song has been skipped" }); });
router.get("/control/previous", (req, res) => { radio.previous(); res.json({ status: 200, message: "Previous song will be played" }); });
router.get("/control/shuffle", (req, res) => { radio.shuffleRemaining(); res.json({ status: 200, message: "Queue shuffled" }); });
router.get("/control/jumpto/:index", (req, res) => { radio.jumpto(req.params.index); res.json({ status: 200, message: `Jumped to Song Index ${req.params.index}` }); });

export default router;