import express from "express";
import http from "http";
import cors from "cors";
import { RadioEngine } from "./radioEngine.js";
import { login, authMiddleware, currentcode } from "./auth/auth.js";
import { setupSwagger } from "./swagger/swagger.js";
// Optional: WebSocket für Live-Meta
// import { initWebSocket } from "./websocket/ws.js";

const app = express();
const server = http.createServer(app);
const radio = new RadioEngine();

app.use(cors());
app.use(express.json());

/* ==========================
   Public Endpoints
========================== */
app.get("/", (req, res) => res.redirect("/swagger"));
setupSwagger(app);

// Login for Token
app.get("/login", login);

/* ==========================
   Protected Radio Endpoints
========================== */
app.use(authMiddleware);

app.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-cache");
  radio.addClient(res);
});

app.post("/skip", (req, res) => {
  radio.skip();
  res.json({ ok: true });
});

app.get("/meta", (req, res) => res.json(radio.getMeta()));

/* ==========================
   WebSocket
========================== */
// initWebSocket(server, radio);

/* ==========================
   Server Start
========================== */
const PORT = 8000;
server.listen(PORT, () => {
  console.log(`MetaWave Live Radio läuft auf Port ${PORT}`);
  console.log(`Swagger UI: http://localhost:${PORT}/swagger`);
  console.log(`Aktueller MetaWave Code: ${currentcode()}`);
});