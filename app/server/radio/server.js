import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { initWebSocket } from "./ws.js";
import { RadioEngine } from "./radioEngine.js";
import QRCode from "qrcode";

const PORT = 8000;
const codesPath = path.resolve('./codes.json');
let codes = JSON.parse(fs.readFileSync(codesPath, 'utf-8'));

const app = express();
app.use(express.json());

// Radio Engine starten
const radio = new RadioEngine();

// --- Auth Middleware ---
function authMiddleware(req, res, next) {
  const code = req.header("X-METAWAVE-CODE") || req.query.token;

  // Tokens bereinigen
  const now = Date.now();
  for (const [t, exp] of Object.entries(codes.tokens)) {
    if (exp < now) delete codes.tokens[t];
  }

  if (!code || !(codes.active.includes(code) || codes.tokens[code])) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

// --- REST Endpoints ---
app.get("/meta", authMiddleware, (req, res) => {
  res.json(radio.getMeta());
});

app.post("/skip", authMiddleware, (req, res) => {
  radio.skip();
  res.json({ status: "skipped" });
});

// --- QR-Code Token Generation ---
app.post("/generate-token", authMiddleware, (req, res) => {
  const token = crypto.randomBytes(4).toString("hex").toUpperCase();
  const expire = Date.now() + 10 * 60 * 1000; // 10 Minuten
  codes.tokens[token] = expire;
  fs.writeFileSync(codesPath, JSON.stringify(codes, null, 2));
  const qrUrl = `metawave://login?token=${token}`;
  res.json({ token, qrUrl });
});

// --- QR-Code Display ---
app.get("/qr/:token", async (req, res) => {
  const { token } = req.params;
  const now = Date.now();

  // Abgelaufene Tokens löschen
  for (const [t, exp] of Object.entries(codes.tokens)) {
    if (exp < now) delete codes.tokens[t];
  }

  if (!codes.tokens[token]) {
    return res.status(401).send("Unauthorized");
  }

  const url = `metawave://login?token=${token}`;
  try {
    const qr = await QRCode.toDataURL(url);
    res.send(`<img src="${qr}"/>`);
  } catch (err) {
    res.status(500).send("QR-Code konnte nicht erstellt werden");
  }
});

// --- WebSocket starten ---
initWebSocket(app, radio);

// --- Server starten ---
app.listen(PORT, () => {
  console.log(`MetaWave Radio läuft auf Port ${PORT}`);
});