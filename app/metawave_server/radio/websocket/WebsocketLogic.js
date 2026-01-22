import { WebSocketServer } from "ws";
import { RadioEngine } from "../core/RadioEngine.js";
import { verifyToken } from "../middleware/AuthLogic.js";

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });
  const radio = new RadioEngine();

  wss.on("connection", (ws, req) => {
    const token = new URL(
      req.url,
      `http://${req.headers.host}`
    ).searchParams.get("token");

    // Optional: Token validieren
    if (!verifyToken(token)) {
      ws.close();
      return;
    }

    radio.addWSClient(ws);

    ws.on("message", (msg) => {
      if (msg.toString() === "SKIP") {
        radio.skip();
      }
    });

    ws.on("close", () => {
      console.log("WS Client disconnected");
    });
  });
}