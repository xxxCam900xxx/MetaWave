import express from "express";
import { RadioEngine } from "./RadioEngine.js";
import { authMiddleware } from "../middleware/AuthLogic.js";

const router = express.Router();
const radio = new RadioEngine();

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

// GET /stream/metadata
router.get("/metadata", (req, res) => {
  res.json(radio.getMeta());
});

// GET /stream/queue
router.get("/queue", (req, res) => {
  res.json(radio.getQueueState());
});

// POST /stream/control/skip
router.post("/control/skip", (req, res) => {
  radio.skip();
  res.json({ ok: true });
});

// POST /stream/control/shuffle
router.post("/control/shuffle", (req, res) => {
  radio.shuffleRemaining();
  res.json({ ok: true });
});

export default router;