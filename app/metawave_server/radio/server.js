import express from "express";
import http from "http";
import cors from "cors";
import { RadioEngine } from "./radioEngine.js";
import { login, authMiddleware, currentcode } from "./auth/auth.js";
import { setupSwagger } from "./swagger/swagger.js";
import { WebSocketServer } from "ws";

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

app.post("/shuffle", (req, res) => {
   radio.shuffleRemaining();
   res.json({ ok: true });
});

app.post("/skip", (req, res) => {
   radio.skip();
   res.json({ ok: true });
});

app.get("/meta-queue", (req, res) => {
   res.json(radio.getQueueState());
});

app.get("/meta", (req, res) => res.json(radio.getMeta()));

/* ==========================
   WebSocket
========================== */
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
   const token = new URL(req.url, `http://${req.headers.host}`).searchParams.get("token");
   // Optional: hier Token prüfen
   radio.addWSClient(ws);

   ws.on("message", (msg) => {
      if (msg.toString() === "SKIP") {
         radio.skip();
      }
   });
});

/* ==========================
   Server Start
========================== */
const PORT = 8000;
server.listen(PORT, async () => {
   console.log(`MetaWave Live Radio läuft auf Port ${PORT}`);
   console.log(`Swagger UI: http://localhost:${PORT}/swagger`);
   console.log(`Aktueller MetaWave Code: ${currentcode()}`);
});