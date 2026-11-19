import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import { VotingStore } from "./VotingStore.js";

process.env.DB_HOST = "unused";
process.env.DB_USER = "unused";
process.env.DB_PASS = "unused";
process.env.DB_NAME = "unused";
const { createVotingRouter } = await import("./VotingRouter.js");

const voter1 = "12345678-1234-4234-8234-123456789abc";
const voter2 = "12345678-1234-4234-8234-123456789abd";
const play1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const play2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("legacy votes survive migration and each playback accumulates independently", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metawave-voting-"));
  try {
    const file = path.join(dir, "stats.json");
    fs.writeFileSync(file, JSON.stringify({ version: 1, songs: [{
      filename: "one.mp3", plays: 2, votes: [[voter1, 1], [voter2, -1]],
    }] }));
    let store = new VotingStore(file);
    assert.deepEqual([store.get("one.mp3").upvotes, store.get("one.mp3").downvotes], [1, 1]);
    store.recordPlay("one.mp3", play1);
    store.vote("one.mp3", play1, voter1, 1);
    store.vote("one.mp3", play1, voter2, -1);
    store.vote("one.mp3", play1, voter2, 1);
    store = new VotingStore(file);
    assert.deepEqual([...store.get("one.mp3").votes.values()], [1, 1]);
    assert.equal(store.get("one.mp3").plays, 3);
    assert.throws(() => store.recordPlay("one.mp3", play1), /DUPLICATE_PLAY/);
    store.recordPlay("one.mp3", play2);
    assert.deepEqual([store.get("one.mp3").upvotes, store.get("one.mp3").downvotes], [3, 1]);
    assert.equal(store.get("one.mp3").votes.size, 0);
    assert.throws(() => store.vote("one.mp3", play1, voter1, -1), /STALE_PLAY/);
    store.vote("one.mp3", play2, voter1, -1);
    store.vote("one.mp3", play2, voter2, 1);
    store.vote("one.mp3", play2, voter2, 0);
    const restored = new VotingStore(file).get("one.mp3");
    assert.deepEqual([restored.upvotes, restored.downvotes, restored.plays], [3, 1, 4]);
    assert.deepEqual([...restored.votes], [[voter1, -1]]);
    assert.throws(() => store.vote("one.mp3", play2, "invalid", 1), /INVALID_VOTE/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("API accepts a vote only for the current playback and preserves earlier votes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metawave-voting-"));
  const store = new VotingStore(path.join(dir, "stats.json"));
  const songs = [{ filename: "one.mp3", title: "One", author: "Artist" },
    { filename: "two.mp3", title: "Two", author: "artist" },
    { filename: "three.mp3", title: "Three", author: "Other" }];
  let meta = { filename: "one.mp3", playId: play1, isSpeaker: false };
  const radio = { getCatalog: () => songs, getMeta: () => meta };
  store.recordPlay("one.mp3", play1);
  const app = express();
  app.use(express.json());
  app.use("/voting", createVotingRouter(radio, store));
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/voting`;
  const auth = { Authorization: `Bearer ${jwt.sign({ scope: "stream" }, process.env.AUTH_SECRET || "changeme_must_set_AUTH_SECRET")}`,
    "Content-Type": "application/json" };
  const post = (body) => fetch(`${base}/vote`, { method: "POST", headers: auth, body: JSON.stringify(body) });
  const vote = (id, value, filename = "one.mp3") => post({ filename, play_id: id, browser_id: voter1, vote: value });
  const stats = async () => (await fetch(`${base}/?browser_id=${voter1}`, { headers: auth })).json();
  try {
    assert.equal((await fetch(`${base}/?browser_id=${voter1}`)).status, 401);
    assert.equal((await vote(play1, 1)).status, 200);
    assert.equal((await vote(play1, -1)).status, 200);
    let data = await stats();
    assert.deepEqual([data.songs[0].upvotes, data.songs[0].downvotes, data.songs[0].my_vote], [0, 1, -1]);
    assert.deepEqual(data.artists.map(artist => [artist.songs, artist.percent]), [[2, 66.7], [1, 33.3]]);
    store.recordPlay("one.mp3", play2);
    meta = { ...meta, playId: play2 };
    data = await stats();
    assert.deepEqual([data.songs[0].upvotes, data.songs[0].downvotes, data.songs[0].my_vote], [0, 1, 0]);
    assert.deepEqual(data.current_play, { filename: "one.mp3", id: play2 });
    assert.equal((await vote(play1, 1)).status, 409);
    assert.equal((await vote(play2, 1, "two.mp3")).status, 409);
    assert.equal((await vote(play2, 1)).status, 200);
    data = await stats();
    assert.deepEqual([data.songs[0].upvotes, data.songs[0].downvotes, data.songs[0].my_vote], [1, 1, 1]);
    meta = { filename: "speaker.wav", playId: null, isSpeaker: true };
    assert.equal((await vote(play2, -1)).status, 409);
    assert.equal((await stats()).current_play, null);
    meta = { filename: "one.mp3", playId: play1, isSpeaker: false };
    assert.equal((await vote(play1, 1)).status, 503);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
