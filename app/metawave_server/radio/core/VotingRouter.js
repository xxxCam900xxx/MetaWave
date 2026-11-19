import express from "express";
import { authMiddleware } from "../middleware/AuthLogic.js";
import { validVoterId } from "./VotingStore.js";

export function createVotingRouter(radio, store) {
  const router = express.Router();
  router.use(authMiddleware);

  router.get("/", (req, res) => {
    const voter = req.query.browser_id;
    if (!validVoterId(voter)) return res.status(400).json({ error: "Ungültige Browser-ID." });
    try {
      const meta = radio.getMeta();
      const currentPlay = !meta.isSpeaker && validVoterId(meta.playId) &&
        store.get(meta.filename).playId === meta.playId ? { filename: meta.filename, id: meta.playId } : null;
      const songs = radio.getCatalog().map(song => {
        const entry = store.get(song.filename);
        const votes = Array.from(entry.votes.values());
        return {
          filename: song.filename, title: song.title, author: song.author,
          upvotes: entry.upvotes + votes.filter(value => value === 1).length,
          downvotes: entry.downvotes + votes.filter(value => value === -1).length,
          my_vote: currentPlay?.filename === song.filename ? entry.votes.get(voter.toLowerCase()) || 0 : 0,
          plays: entry.plays,
        };
      });
      const artists = new Map();
      for (const song of songs) {
        const name = typeof song.author === "string" && song.author.trim() ? song.author.trim() : "Unbekannt";
        const key = name.toLocaleLowerCase("de-CH");
        const current = artists.get(key) || { name, songs: 0 };
        current.songs++;
        artists.set(key, current);
      }
      res.json({
        songs, total_songs: songs.length, current_play: currentPlay,
        artists: Array.from(artists.values()).map(artist => ({
          ...artist, percent: songs.length ? Math.round(artist.songs * 1000 / songs.length) / 10 : 0,
        })).sort((a, b) => b.songs - a.songs || a.name.localeCompare(b.name, "de")),
        warning: store.playCountError ? "Einige Abspielstarts konnten nicht gespeichert werden. Serverprotokoll prüfen." : null,
      });
    } catch (error) {
      console.error("[Voting] Statistiken konnten nicht geladen werden:", error);
      res.status(500).json({ error: "Statistiken konnten nicht geladen werden." });
    }
  });

  router.post("/vote", (req, res) => {
    const { filename, play_id: playId, browser_id: voter, vote } = req.body || {};
    if (typeof filename !== "string" || !validVoterId(playId) || !validVoterId(voter) || ![-1, 0, 1].includes(vote)) {
      return res.status(400).json({ error: "Ungültige Stimme." });
    }
    try {
      if (!radio.getCatalog().some(song => song.filename === filename)) {
        return res.status(404).json({ error: "Titel ist nicht in der aktiven Playlist." });
      }
      const meta = radio.getMeta();
      if (meta.isSpeaker || meta.filename !== filename || meta.playId !== playId) {
        return res.status(409).json({ error: "Die Wiedergabe hat gewechselt. Bitte erneut abstimmen." });
      }
      if (store.get(filename).playId !== playId) {
        return res.status(503).json({ error: "Voting für diese Wiedergabe ist derzeit nicht verfügbar." });
      }
      store.vote(filename, playId, voter, vote);
      res.json({ ok: true });
    } catch (error) {
      console.error("[Voting] Stimme konnte nicht gespeichert werden:", error);
      res.status(500).json({ error: "Stimme konnte nicht gespeichert werden." });
    }
  });

  return router;
}
