import express from "express";
import http from "http";
import { RadioEngine } from "./radioEngine.js";
import { authMiddleware, TOKENS } from "./auth.js";
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
  const expiresIn = 15 * 60 * 1000; // 15 Minuten
  TOKENS.set(token, Date.now() + expiresIn);
  res.json({ token, expiresIn: 15 * 60 });
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