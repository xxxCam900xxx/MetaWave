import express from "express";
import { RadioEngine } from "./radioEngine.js";
import { authMiddleware } from "./auth.js";

const app = express();
const radio = new RadioEngine();

// ALLES schützen
app.use(authMiddleware);

app.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-cache");
  radio.addClient(res);
});

app.post("/skip", (req, res) => {
  radio.skip();
  res.json({ status: "skipped" });
});

app.get("/meta", (req, res) => {
  res.json(radio.getMeta());
});

app.listen(8000, () => {
  console.log("MetaWave Radio läuft auf Port 8000");
});