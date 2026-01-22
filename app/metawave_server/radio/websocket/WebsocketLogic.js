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

    // Beim Verbindungsaufbau aktuellen Track + Queue an den Client schicken
    try {
      const meta = radio.getMeta();
      ws.send(JSON.stringify({ type: "trackChanged", meta }));

      const queueState = radio.getQueueState();
      ws.send(JSON.stringify({ type: "queueUpdated", queue: queueState }));
    } catch (err) {
      console.error("Failed to send initial WS state:", err);
    }

    ws.on("message", (msg) => {
      const m = msg.toString();
      if (m === "SKIP") radio.skip();
      if (m === "PREVIOUS") radio.previous();
      if (m === "SHUFFLE_REMAINING") radio.shuffleRemaining();
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