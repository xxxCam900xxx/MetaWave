import express from "express";
import { RadioEngine } from "./radioEngine.js";

const app = express();
const radio = new RadioEngine();

app.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-cache");
  radio.addClient(res);
});

app.post("/skip", (req, res) => {
  radio.skip();
  res.json({ status: "skipped" });
});

app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

app.listen(8000, () => {
  console.log("MetaWave Radio läuft auf Port 8000");
});