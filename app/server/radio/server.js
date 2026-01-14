import express from "express";
import fs from "fs";
import QRCode from "qrcode";

import { RadioEngine } from "./radioEngine.js";
import { authMiddleware } from "./auth.js";
import { setupSwagger } from "./swagger.js";

const app = express();
const radio = new RadioEngine();

app.use(express.json());

/* =======================
   SWAGGER – OHNE AUTH
======================= */
setupSwagger(app);

/* =======================
   PUBLIC ENDPOINTS
======================= */

app.get("/", (req, res) => {
  res.redirect("/swagger");
})

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/generate-token", (req, res) => {
  const token = Math.random().toString(16).substring(2, 10).toUpperCase();
  res.json({ token });
});

app.get("/qr/:token", async (req, res) => {
  const qr = await QRCode.toDataURL(req.params.token);
  res.type("html").send(`<img src="${qr}" />`);
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

app.listen(8000, () => {
  console.log("MetaWave Radio läuft auf Port 8000");
});