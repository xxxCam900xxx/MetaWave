import http from "http";
import express from "express";
import { RadioEngine } from "./radioEngine.js";
import { authMiddleware } from "./auth.js";
import { initWebSocket } from "./ws.js";

const app = express();
const server = http.createServer(app);
const radio = new RadioEngine();

app.use(authMiddleware);

app.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "audio/mpeg");
  radio.addClient(res);
});

app.post("/skip", (req, res) => {
  radio.skip();
  res.json({ status: "skipped" });
});

app.get("/meta", (req, res) => {
  res.json(radio.getMeta());
});

initWebSocket(server, radio);

server.listen(8000, () => {
  console.log("MetaWave Radio läuft auf Port 8000");
});