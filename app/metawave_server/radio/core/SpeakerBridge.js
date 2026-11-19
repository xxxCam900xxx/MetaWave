import { Readable } from "stream";
import express from "express";
import { authMiddleware } from "../middleware/AuthLogic.js";

const base = process.env.SPEAKER_URL || "http://metawave-speaker:8010";
export const speakerRouter = express.Router();
speakerRouter.use(authMiddleware);

async function proxy(req, res, endpoint) {
  try {
    const response = await fetch(`${base}${endpoint}`, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        ...(req.headers.range ? { Range: req.headers.range } : {}),
      },
      body: req.method === "POST" ? JSON.stringify(req.body || {}) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    res.status(response.status);
    res.set("Cache-Control", "no-store");
    const type = response.headers.get("content-type");
    if (type) res.set("Content-Type", type);
    const length = response.headers.get("content-length");
    if (length) res.set("Content-Length", length);
    for (const header of ["content-range", "accept-ranges"]) {
      const value = response.headers.get(header);
      if (value) res.set(header, value);
    }
    if (!response.body) return res.end();
    const stream = Readable.fromWeb(response.body);
    stream.on("error", err => {
      console.error("[Speaker] Proxy stream failed:", err);
      res.destroy(err);
    });
    stream.pipe(res);
  } catch (err) {
    console.error("[Speaker] Service request failed:", err.message);
    if (!res.headersSent) res.status(503).json({ detail: "Speaker-Service nicht erreichbar" });
    else res.destroy(err);
  }
}

speakerRouter.get("/status", (req, res) => proxy(req, res, "/status"));
speakerRouter.get("/config", (req, res) => proxy(req, res, "/config"));
speakerRouter.post("/config", (req, res) => proxy(req, res, "/config"));
speakerRouter.post("/trigger-prepare", (req, res) => proxy(req, res, "/trigger-prepare"));
speakerRouter.get("/jobs/:id", (req, res) => {
  if (!/^[a-f0-9]{32}$/.test(req.params.id)) return res.status(400).json({ detail: "Ungültige Job-ID" });
  return proxy(req, res, `/jobs/${req.params.id}`);
});
speakerRouter.get("/jobs/:id/audio", (req, res) => {
  if (!/^[a-f0-9]{32}$/.test(req.params.id)) return res.status(400).json({ detail: "Ungültige Job-ID" });
  return proxy(req, res, `/jobs/${req.params.id}/audio`);
});
speakerRouter.get("/audio/latest", (req, res) => proxy(req, res, "/audio/latest"));

export function startSpeakerBridge(radio) {
  let busy = false;
  let lastError = 0;
  let pendingAck = null;
  return setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      if (pendingAck) {
        const ack = await fetch(`${base}/internal/ack`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pendingAck),
          signal: AbortSignal.timeout(2000),
        });
        if (!ack.ok) throw new Error(`Acknowledgement HTTP ${ack.status}`);
        pendingAck = null;
      }
      if (radio.pendingSpeaker) {
        const { episode } = radio.pendingSpeaker;
        if (Date.now() - Date.parse(episode.target) >= 1800000) {
          console.error("[Speaker] Timed out waiting for a suitable song transition");
          radio.failPendingSpeaker();
          return;
        }
        const candidate = radio.speakerCandidate();
        if (!candidate) return;
        if (!radio._speakerCandidateMatches(radio.pendingSpeaker.prepared)) radio.invalidateSpeakerPreparation();
        const response = await fetch(`${base}/internal/transition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: episode.key, filename: episode.filename,
            previous: candidate.previous, following: candidate.following,
          }),
          signal: AbortSignal.timeout(2000),
        });
        if (!response.ok) throw new Error(`Transition HTTP ${response.status}`);
        const result = await response.json();
        if (result.state === "ready" && !radio._speakerCandidateMatches(radio.pendingSpeaker?.prepared)) {
          radio.prepareSpeaker(candidate, { filename: result.filename, duration: result.duration });
        } else if (result.state === "failed") {
          console.error("[Speaker] Transition preparation failed:", result.error);
          radio.failPendingSpeaker();
        }
        return;
      }
      const response = await fetch(`${base}/internal/due`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playing: !radio.isPaused && !radio.speakerEpisode && radio.queue.length > 0 }),
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { episode } = await response.json();
      if (episode) {
        const accepted = radio.queueSpeaker(episode, played => {
          pendingAck = { key: episode.key, filename: episode.filename, played };
        });
        if (!accepted) {
          pendingAck = { key: episode.key, filename: episode.filename, played: false };
          console.error("[Speaker] Scheduled episode could not be queued:", episode.filename);
        }
      }
    } catch (err) {
      if (Date.now() - lastError > 60000) {
        console.error("[Speaker] Playout check failed:", err.message);
        lastError = Date.now();
      }
    } finally {
      busy = false;
    }
  }, 500);
}
