import { WebSocketServer } from "ws";
import url from "url";
import fs from "fs";

const codes = JSON.parse(fs.readFileSync(new URL("./codes.json", import.meta.url)));

export function initWebSocket(server, radio) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const { query } = url.parse(req.url, true);
    const code = query.code;

    if (!code || !codes.active.includes(code)) {
      ws.close(1008, "Unauthorized");
      return;
    }

    ws.send(JSON.stringify(radio.getMeta()));

    const listener = meta => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(meta));
    };
    radio.onMetaUpdate(listener);

    ws.on("close", () => {
      radio.metaListeners.delete(listener);
    });
  });
}