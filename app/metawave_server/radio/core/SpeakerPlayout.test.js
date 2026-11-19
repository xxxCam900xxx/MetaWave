import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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
  radio._trackStartedAt = Date.now() - 12_000;
  radio._pausedElapsed = 0;
}

afterEach(() => {
  if (radio._trackTimer) clearTimeout(radio._trackTimer);
  radio._trackTimer = null;
});

test("speaker interrupts and then resumes the same music position", () => {
  resetRadio();
  assert.equal(radio.startSpeaker({ filename, duration: 10 }), true);
  assert.equal(radio.getMeta().isSpeaker, true);
  assert.equal(radio.getMeta().filename, filename);
  radio._finishSpeaker();
  assert.equal(radio.getMeta().filename, "music.mp3");
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
