import { WebSocketServer } from "ws";
import { radio } from "../core/RadioEngine.js";
import { verifyToken } from "../middleware/AuthLogic.js";

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws, req) => {
    const token = new URL(req.url || "", `http://${req.headers.host}`).searchParams.get("token");

    if (!verifyToken(token)) {
      ws.close();
      return;
    }

    radio.addWSClient(ws);

    // Beim Verbindungsaufbau: aktuellen Track + Queue + Volume + Wiedergabestatus senden
    try {
      ws.send(JSON.stringify({ type: "trackChanged", meta: radio.getMeta() }));
      ws.send(JSON.stringify({ type: "queueUpdated", queue: radio.getQueueState() }));
      ws.send(JSON.stringify({ type: "volumeChanged", volume: radio.volumePercent }));
      ws.send(JSON.stringify({ type: "playbackStateChanged", meta: radio.getMeta() }));
    } catch (err) {
      console.error("Failed to send initial WS state:", err);
    }

    ws.on("message", (msg) => {
      const m = msg.toString();
      if (m === "SKIP")              radio.skip();
      if (m === "PREVIOUS")          radio.previous();
      if (m === "SHUFFLE_REMAINING") radio.shuffleRemaining();
      if (m === "SONG_ENDED")        radio.clientReportedSongEnded();
      if (m.startsWith("VOLUME:")) {
        const pct = Number(m.split(":")[1]);
        if (!Number.isNaN(pct)) radio.setVolume(pct); // broadcasts to ALL clients
      }
      if (m.startsWith("JUMPTO:")) {
        const idx = m.split(":")[1];
        radio.jumpto(idx);
      }
    });

    ws.on("close", () => {
      console.log("WS Client disconnected");
    });
  });
}