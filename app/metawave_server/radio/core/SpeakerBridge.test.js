import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { after, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";

process.env.AUTH_SECRET = "speaker-test-secret";
process.env.DB_HOST = "unused";
process.env.DB_USER = "unused";
process.env.DB_PASS = "unused";
process.env.DB_NAME = "unused";

let dueCalls = 0;
let ackBody;
let receivedRange;
const upstream = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (req.url === "/internal/due") {
    dueCalls++;
    const episode = dueCalls === 1 ? { key: "123-abcdef1234567890", filename: "speaker-test.wav", duration: 5 } : null;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ episode }));
  } else if (req.url === "/internal/ack") {
    ackBody = JSON.parse(Buffer.concat(chunks).toString());
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ state: "played" }));
  } else if (req.url === "/audio/latest") {
    receivedRange = req.headers.range;
    res.writeHead(206, { "Content-Type": "audio/wav", "Content-Range": "bytes 0-3/4", "Accept-Ranges": "bytes" });
    res.end("RIFF");
  } else {
    res.writeHead(404);
    res.end();
  }
});
upstream.listen(0, "127.0.0.1");
await once(upstream, "listening");
process.env.SPEAKER_URL = `http://127.0.0.1:${upstream.address().port}`;
const { speakerRouter, startSpeakerBridge } = await import("./SpeakerBridge.js");
const app = express();
app.use(express.json(), speakerRouter);
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const token = jwt.sign({ scope: "stream" }, process.env.AUTH_SECRET);

after(() => {
  upstream.close();
  server.close();
});

test("proxy requires radio authentication and forwards audio range responses", async () => {
  assert.equal((await fetch(`${base}/audio/latest`)).status, 401);
  const response = await fetch(`${base}/audio/latest`, {
    headers: { Authorization: `Bearer ${token}`, Range: "bytes=0-3" },
  });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), "bytes 0-3/4");
  assert.equal(receivedRange, "bytes=0-3");
  assert.equal(await response.text(), "RIFF");
});

test("bridge starts the episode and acknowledges the result", async () => {
  const started = [];
  const radio = { isPaused: false, speakerEpisode: null, queue: [{}], startSpeaker: episode => { started.push(episode); return true; } };
  const interval = startSpeakerBridge(radio);
  try {
    const deadline = Date.now() + 4000;
    while (!ackBody && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(started.length, 1);
    assert.deepEqual(ackBody, { key: "123-abcdef1234567890", filename: "speaker-test.wav", played: true });
  } finally {
    clearInterval(interval);
  }
});
