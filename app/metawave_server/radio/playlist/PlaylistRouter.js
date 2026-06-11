import express from "express";
import { authMiddleware } from "../middleware/AuthLogic.js";
import {
  getAllPlaylists,
  addPlaylist,
  updatePlaylist,
  deletePlaylist,
} from "./PlaylistLogic.js";

const router = express.Router();

router.use(authMiddleware);

// GET /playlist
router.get("/", async (req, res) => {
  try {
    const playlists = await getAllPlaylists();
    res.json({ status: 200, playlists });
  } catch (err) {
    console.error("PlaylistRouter GET /:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /playlist
router.post("/", async (req, res) => {
  const { name, url } = req.body;
  try {
    const playlist = await addPlaylist(name, url);
    res.status(201).json({ status: 201, message: "Playlist added", playlist });
  } catch (err) {
    if (err.message === "INVALID_INPUT")
      return res.status(400).json({ error: "name and url are required" });
    if (err.message === "INVALID_URL")
      return res.status(400).json({ error: "Invalid URL format" });
    if (err.message === "PLAYLIST_EXISTS")
      return res.status(409).json({ error: "A playlist with this URL already exists" });
    console.error("PlaylistRouter POST /:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /playlist/:id
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid playlist id" });
  try {
    await updatePlaylist(id, req.body);
    res.json({ status: 200, message: "Playlist updated" });
  } catch (err) {
    if (err.message === "NOT_FOUND")
      return res.status(404).json({ error: "Playlist not found" });
    if (err.message === "NO_CHANGES")
      return res.status(400).json({ error: "No fields to update" });
    if (err.message === "INVALID_URL")
      return res.status(400).json({ error: "Invalid URL format" });
    console.error("PlaylistRouter PUT /:id:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /playlist/:id
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid playlist id" });
  try {
    await deletePlaylist(id);
    res.json({ status: 200, message: "Playlist deleted" });
  } catch (err) {
    if (err.message === "NOT_FOUND")
      return res.status(404).json({ error: "Playlist not found" });
    console.error("PlaylistRouter DELETE /:id:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
