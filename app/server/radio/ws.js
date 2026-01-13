import { WebSocketServer } from "ws";
import url from "url";
import fs from "fs";
import path from "path";

const codesPath = path.resolve('./codes.json');
let codes = JSON.parse(fs.readFileSync(codesPath, 'utf-8'));

export function initWebSocket(app, radio) {
  const server = app.listen(); // Express Server
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const { query } = url.parse(req.url, true);
    const code = query.code;

    // Tokens bereinigen
    const now = Date.now();
    for (const [t, exp] of Object.entries(codes.tokens)) {
      if (exp < now) delete codes.tokens[t];
    }

    if (!code || !(codes.active.includes(code) || codes.tokens[code])) {
      ws.close(1008, "Unauthorized");
      return;
    }

    // Initial Meta
    ws.send(JSON.stringify(radio.getMeta()));

    // Live Updates
    const listener = meta => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(meta));
    };
    radio.onMetaUpdate(listener);

    ws.on("close", () => {
      radio.metaListeners.delete(listener);
    });
  });
}