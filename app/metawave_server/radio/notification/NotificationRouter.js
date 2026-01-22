import express from "express";
import { addGroup, removeGroup, sendWaveTokenToGroup } from "./NotificationLogic.js";
import { runNotificationJob } from "./NotificationJob.js";
import { authMiddleware } from "../middleware/AuthLogic.js";

const router = express.Router();

// POST /signal/invite
router.post("/signal/invite", async (req, res) => {
  const { groupId } = req.body;

  try {
    const result = await addGroup(groupId);
    try {
      await sendWaveTokenToGroup(groupId);
    } catch (err) {
      console.error("Failed to send WaveToken to newly added group:", err);
    }
    res.status(201).json({ status: 201, message: "SignalGroup was Successfully added", result });
  } catch (err) {
    if (err.message === "INVALID_GROUP_ID") return res.status(400).json({ error: "groupId fehlt" });
    if (err.message === "GROUP_EXISTS") return res.status(409).json({ error: "Gruppe existiert bereits" });
    console.error(err);
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

// POST /signal/leave
router.post("/signal/leave", async (req, res) => {
  const { groupId } = req.body;
  try {
    const result = await removeGroup(groupId);
    res.status(200).json({ status: 200, message: "SignalGroup was Successfully deleted", result });
  } catch (err) {
    if (err.message === "INVALID_GROUP_ID") return res.status(400).json({ error: "groupId fehlt" });
    if (err.message === "GROUP_NOT_FOUND") return res.status(404).json({ error: "Gruppe nicht gefunden" });
    console.error(err);
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

// POST /signal/run-job
router.get("/run-job", authMiddleware, async (req, res) => {
  try {
    await runNotificationJob();
    res.status(200).json({ status: 200, message: "Signal Notification job executed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Job failed" });
  }
});

export default router;