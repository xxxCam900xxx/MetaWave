import express from "express";
import { addGroup } from "./NotificationLogic.js";

const router = express.Router();

// POST /notification/signal/invite
router.post("/signal/invite", async (req, res) => {
  const { groupId } = req.body;

  try {
    const result = await addGroup(groupId);
    res.json(result);

  } catch (err) {

    if (err.message === "INVALID_GROUP_ID") {
      return res.status(400).json({ error: "groupId fehlt" });
    }

    if (err.message === "GROUP_EXISTS") {
      return res.status(409).json({ error: "Gruppe existiert bereits" });
    }

    console.error(err);
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

export default router;