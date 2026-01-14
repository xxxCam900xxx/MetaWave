import express from "express";
import http from "http";
import { RadioEngine } from "./radioEngine.js";
import { authMiddleware, TOKENS, TOKEN_EXPIRY } from "./auth.js";
import { setupSwagger } from "./swagger.js";
import { initWebSocket } from "./ws.js";

const app = express();
const radio = new RadioEngine();
const server = http.createServer(app);

app.use(express.json());

/* =======================
   SWAGGER – OHNE AUTH
======================= */
setupSwagger(app);

/* =======================
   PUBLIC ENDPOINTS
======================= */
app.get("/", (req, res) => res.redirect("/swagger"));

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.post("/generate-token", (req, res) => {
  const token = Math.random().toString(16).substring(2, 10).toUpperCase();
  TOKENS.set(token, { expiresAt: Date.now() + TOKEN_EXPIRY });
  res.json({ token, expiresIn: TOKEN_EXPIRY / 1000 }); // in Sekunden
});

/* =======================
   AUTH AB HIER
======================= */
app.use(authMiddleware);

/* =======================
   RADIO ENDPOINTS
======================= */
app.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "audio/mpeg");
  radio.addClient(res);
});

app.post("/skip", (req, res) => {
  radio.skip();
  res.json({ ok: true });
});

app.get("/meta", (req, res) => {
  res.json(radio.getMeta());
});

/* =======================
   WEBSOCKET SERVER
======================= */
initWebSocket(server, radio);

/* =======================
   SERVER START
======================= */
server.listen(8000, () => {
  console.log("MetaWave Radio läuft auf Port 8000");
});