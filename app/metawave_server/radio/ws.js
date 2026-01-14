import { WebSocketServer } from "ws";
import url from "url";

export function initWebSocket(server, radio) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const { query } = url.parse(req.url, true);
    const code = query.code;

    if (!code) {
      ws.close(1008, "Unauthorized");
      return;
    }

    // Initial Meta senden
    ws.send(JSON.stringify(radio.getMeta()));

    // Meta Updates
    const listener = meta => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(meta));
    };
    radio.onMetaUpdate(listener);

    ws.on("close", () => radio.metaListeners.delete(listener));
  });
}