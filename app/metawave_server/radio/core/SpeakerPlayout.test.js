import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { once } from "node:events";
import { afterEach, test } from "node:test";
import mysql from "mysql2/promise";

process.env.DB_HOST = "unused";
process.env.DB_USER = "unused";
process.env.DB_PASS = "unused";
process.env.DB_NAME = "unused";
mysql.createPool = () => ({ execute: async () => [[{ enabled: 0 }]] });
const songsDir = path.resolve("/songs");
const realExists = fs.existsSync;
const realReadDir = fs.readdirSync;
fs.existsSync = value => String(value) === path.join(songsDir, "metadata.json")
  ? false
  : String(value).endsWith("speaker-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.wav") || realExists(value);
fs.readdirSync = (value, ...args) => String(value) === songsDir ? [] : realReadDir(value, ...args);
const { radio } = await import("./RadioEngine.js");
clearInterval(radio._metadataReloadInterval);
clearInterval(radio._scheduleInterval);
await new Promise(resolve => setImmediate(resolve));

const filename = "speaker-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.wav";

function resetRadio() {
  if (radio._trackTimer) clearTimeout(radio._trackTimer);
  radio.queue = [{ filename: "music.mp3", title: "Music", duration: 60 }, { filename: "next.mp3", duration: 60 }];
  radio.currentIndex = 0;
  radio.isPaused = false;
  radio.speakerEpisode = null;
  radio.pendingSpeaker = null;
  if (radio._speakerFadeTimer) clearTimeout(radio._speakerFadeTimer);
  radio._speakerFadeTimer = null;
  radio._trackStartedAt = Date.now() - 12_000;
  radio._pausedElapsed = 0;
}

afterEach(() => {
  if (radio._trackTimer) clearTimeout(radio._trackTimer);
  radio._trackTimer = null;
  if (radio._speakerFadeTimer) clearTimeout(radio._speakerFadeTimer);
  radio._speakerFadeTimer = null;
});

test("prepared broadcast waits for the song to finish and plays the announced next track", () => {
  resetRadio();
  radio.queue[1].title = "Next song";
  const results = [];
  assert.equal(radio.queueSpeaker({ filename, key: "key" }, played => results.push(played)), true);
  const candidate = radio.speakerCandidate();
  assert.equal(candidate.previous, "Music");
  assert.equal(candidate.following, "Next song");
  assert.equal(radio.prepareSpeaker(candidate, { filename, duration: 10 }), true);
  assert.equal(radio.getMeta().filename, "music.mp3");
  assert.deepEqual(results, []);
  radio._autoAdvance();
  assert.equal(radio.getMeta().isSpeaker, true);
  assert.deepEqual(results, [true]);
  radio.queue.push({ filename: "third.mp3", title: "Third", duration: 60 });
  radio.moveInQueue(1, 2);
  radio._finishSpeaker();
  assert.equal(radio.getMeta().filename, "next.mp3");
});

test("playlist changes preserve current playback and defer during a speaker handoff", () => {
  resetRadio();
  radio.queue.unshift({ filename: "already-played.mp3", duration: 60 });
  radio.currentIndex = 1;
  const originalCatalog = radio.getCatalog;
  radio.getCatalog = () => [
    { id: "a", filename: "music.mp3", duration: 60 },
    { id: "b", filename: "next.mp3", duration: 60 },
    { id: "c", filename: "holiday.mp3", duration: 60 },
  ];
  const programs = [
    { id: 1, is_main: 1, is_active: 1 },
    { id: 2, is_main: 0, is_active: 1, start_date: "11-01", start_time: "00:00", end_date: "01-01", end_time: "00:00" },
  ];
  const membership = { 1: ["a", "b"], 2: ["c"] };
  const now = new Date("2026-12-01T12:00:00Z");
  const started = radio._trackStartedAt;
  const updates = [];
  const client = { readyState: 1, send: payload => updates.push(JSON.parse(payload)) };
  radio.wsClients.add(client);
  try {
    radio.pendingSpeaker = { prepared: null };
    assert.equal(radio.updatePlaylistProgram(programs, membership, now), false);
    assert.equal(radio.queue.length, 3);
    radio.pendingSpeaker = null;
    assert.equal(radio.updatePlaylistProgram(programs, membership, now), true);
    assert.equal(radio.getMeta().filename, "music.mp3");
    assert.equal(radio.currentIndex, 1);
    assert.equal(radio._trackStartedAt, started);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].type, "queueUpdated");
    assert.equal(updates[0].meta.index, 1);
    assert.deepEqual(radio.queue.map(song => song.filename), ["already-played.mp3", "music.mp3", "next.mp3", "holiday.mp3"]);
    radio.updatePlaylistProgram(programs, membership, new Date("2027-02-01T12:00:00Z"));
    assert.deepEqual(radio.queue.map(song => song.filename), ["already-played.mp3", "music.mp3", "next.mp3"]);
  } finally {
    radio.getCatalog = originalCatalog;
    radio.playlistPrograms = null;
    radio.playlistMemberships = null;
    radio._playlistProgramSignature = null;
    radio.pendingSpeaker = null;
    radio.wsClients.delete(client);
  }
});

test("changed queue invalidates old song announcements and waits for another song end", () => {
  resetRadio();
  radio.queue.push({ filename: "third.mp3", title: "Third", duration: 60 });
  const results = [];
  radio.queueSpeaker({ filename, key: "key" }, played => results.push(played));
  const candidate = radio.speakerCandidate();
  radio.prepareSpeaker(candidate, { filename, duration: 10 });
  radio.moveInQueue(2, 1);
  radio._autoAdvance();
  assert.equal(radio.getMeta().filename, "third.mp3");
  assert.equal(radio.getMeta().isSpeaker, false);
  assert.deepEqual(results, []);
  const updated = radio.speakerCandidate();
  assert.equal(updated.previous, "Third");
  assert.equal(radio.prepareSpeaker(updated, { filename, duration: 10 }), true);
  radio._autoAdvance();
  assert.equal(radio.getMeta().isSpeaker, true);
  assert.deepEqual(results, [true]);
});

test("previously excluded songs are included on queue load and metadata reload", () => {
  resetRadio();
  const exists = fs.existsSync;
  const readFile = fs.readFileSync;
  const readDir = fs.readdirSync;
  const metadataFile = path.join(songsDir, "metadata.json");
  let hasMetadata = false;
  radio.votingStore = { get: () => ({ excluded: true }) };
  fs.existsSync = value => String(value) === metadataFile ? hasMetadata
    : String(value).startsWith(songsDir) ? true : exists(value);
  fs.readdirSync = (value, ...args) => String(value) === songsDir ? ["music.mp3", "next.mp3"] : readDir(value, ...args);
  fs.readFileSync = (value, ...args) => String(value) === metadataFile
    ? JSON.stringify([{ filename: "music.mp3", duration: 60 }, { filename: "next.mp3", duration: 60 }])
    : readFile(value, ...args);
  try {
    radio.loadQueue();
    assert.deepEqual(new Set(radio.queue.map(song => song.filename)), new Set(["music.mp3", "next.mp3"]));
    hasMetadata = true;
    radio.loadQueue();
    assert.deepEqual(new Set(radio.queue.map(song => song.filename)), new Set(["music.mp3", "next.mp3"]));
    radio.queue = [{ filename: "music.mp3", duration: 60 }];
    radio.currentIndex = 0;
    radio._reloadMetadata();
    assert.deepEqual(radio.queue.map(song => song.filename), ["music.mp3", "next.mp3"]);
  } finally {
    delete radio.votingStore;
    fs.existsSync = exists;
    fs.readFileSync = readFile;
    fs.readdirSync = readDir;
  }
});

test("play starts are counted once on resume, not on pause and resume of an existing start", () => {
  resetRadio();
  const starts = [];
  const listener = (filename, playId) => starts.push({ filename, playId });
  radio.on("songStarted", listener);
  try {
    radio._startTrack(0);
    const first = radio.getMeta().playId;
    assert.ok(first);
    radio.pause();
    radio.resume();
    assert.deepEqual(starts, [{ filename: "music.mp3", playId: first }]);
    assert.equal(radio.getMeta().playId, first);
    radio.pause();
    radio._startTrack(1);
    assert.equal(radio.getMeta().playId, null);
    assert.equal(starts.length, 1);
    radio.resume();
    const second = radio.getMeta().playId;
    assert.ok(second);
    assert.notEqual(second, first);
    assert.deepEqual(starts, [{ filename: "music.mp3", playId: first }, { filename: "next.mp3", playId: second }]);
    radio._startTrack(0);
    assert.notEqual(radio.getMeta().playId, first);
  } finally {
    radio.off("songStarted", listener);
  }
});

test("bridge and radio prepare, wait, play and acknowledge a complete handoff", async () => {
  resetRadio();
  radio.queue[1].title = "Next song";
  let due = 0;
  let acknowledged = null;
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/internal/due") {
      res.end(JSON.stringify({ episode: due++ === 0
        ? { filename, duration: 10, key: "123-abcdef1234567890", target: new Date().toISOString() }
        : null }));
    } else if (req.url === "/internal/transition") {
      assert.equal(body.previous, "Music");
      assert.equal(body.following, "Next song");
      res.end(JSON.stringify({ state: "ready", filename, duration: 10 }));
    } else {
      acknowledged = body;
      res.end(JSON.stringify({ state: "played" }));
    }
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  process.env.SPEAKER_URL = `http://127.0.0.1:${upstream.address().port}`;
  const { startSpeakerBridge } = await import("./SpeakerBridge.js");
  const interval = startSpeakerBridge(radio);
  try {
    const deadline = Date.now() + 5000;
    while (!radio.pendingSpeaker?.prepared && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(radio.pendingSpeaker?.prepared);
    assert.equal(radio.getMeta().filename, "music.mp3");
    assert.equal(acknowledged, null);
    radio._autoAdvance();
    assert.equal(radio.getMeta().isSpeaker, true);
    while (!acknowledged && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(acknowledged?.played, true);
    radio._finishSpeaker();
    assert.equal(radio.getMeta().filename, "next.mp3");
  } finally {
    clearInterval(interval);
    await new Promise(resolve => upstream.close(resolve));
  }
});

test("speaker interrupts and then resumes the same music position", () => {
  resetRadio();
  radio._startTrack(0);
  const playId = radio.getMeta().playId;
  radio._trackStartedAt = Date.now() - 12_000;
  assert.equal(radio.startSpeaker({ filename, duration: 10 }), true);
  assert.equal(radio.getMeta().isSpeaker, true);
  assert.equal(radio.getMeta().playId, null);
  assert.equal(radio.getMeta().filename, filename);
  radio._finishSpeaker();
  assert.equal(radio.getMeta().filename, "music.mp3");
  assert.equal(radio.getMeta().playId, playId);
  assert.ok(radio.getMeta().elapsed >= 12 && radio.getMeta().elapsed <= 13);
});

test("speaker respects pause and continues only after resume", async () => {
  resetRadio();
  radio.pause();
  assert.equal(radio.startSpeaker({ filename, duration: 0.15 }), false);
  radio.resume();
  assert.equal(radio.startSpeaker({ filename, duration: 0.15 }), true);
  radio.pause();
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(radio.getMeta().isSpeaker, true);
  radio.resume();
  await new Promise(resolve => setTimeout(resolve, 220));
  assert.equal(radio.getMeta().isSpeaker, false);
  assert.equal(radio.getMeta().filename, "music.mp3");
});

test("manual skip cancels the speaker and advances the queue", () => {
  resetRadio();
  assert.equal(radio.startSpeaker({ filename, duration: 10 }), true);
  radio.skip();
  assert.equal(radio.getMeta().filename, "next.mp3");
  assert.equal(radio.getMeta().isSpeaker, false);
});

test("work schedule uses Zurich local time in winter, summer and DST transitions", () => {
  radio.workSchedule = { enabled: true, startTime: "09:00", endTime: "17:00" };
  assert.equal(radio._shouldPlayForWorkSchedule(new Date("2026-01-15T07:59:00Z")), false);
  assert.equal(radio._shouldPlayForWorkSchedule(new Date("2026-01-15T08:00:00Z")), true);
  assert.equal(radio._shouldPlayForWorkSchedule(new Date("2026-07-15T06:59:00Z")), false);
  assert.equal(radio._shouldPlayForWorkSchedule(new Date("2026-07-15T07:00:00Z")), true);
  radio.workSchedule = { enabled: true, startTime: "02:00", endTime: "03:00" };
  assert.equal(radio._shouldPlayForWorkSchedule(new Date("2026-03-29T01:00:00Z")), false);
  assert.equal(radio._shouldPlayForWorkSchedule(new Date("2026-10-25T00:30:00Z")), true);
  assert.equal(radio._shouldPlayForWorkSchedule(new Date("2026-10-25T01:30:00Z")), true);
});

test("jump by filename selects the intended track and cover after queue reordering", () => {
  resetRadio();
  radio.queue = [
    { filename: "a.mp3", title: "A", cover: "cover-a", duration: 60 },
    { filename: "b.mp3", title: "B", cover: "cover-b", duration: 60 },
    { filename: "c.mp3", title: "C", cover: "cover-c", duration: 60 },
  ];
  radio.moveInQueue(2, 1);
  assert.equal(radio.jumpToSong("b.mp3"), true);
  assert.equal(radio.getMeta().filename, "b.mp3");
  assert.equal(radio.getMeta().cover, "cover-b");
  assert.equal(radio.getQueueState().queue[radio.currentIndex].song, "b.mp3");
  assert.equal(radio.jumpToSong("missing.mp3"), false);
});
