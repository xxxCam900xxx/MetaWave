import test from "node:test";
import assert from "node:assert/strict";
import { fadeMusicForSpeaker, fadeSpeakerTransition } from "./speakerFade.ts";

test("fades music to silence before the news and restores volume if cancelled", async () => {
  const levels = [];
  await fadeMusicForSpeaker({ setVolumeAsync: async v => levels.push(v) }, () => 0.8, () => true, () => true, 120);
  assert.equal(levels.at(-1), 0);
  assert.ok(levels[0] > levels.at(-1));
  let active = true;
  const cancelled = [];
  await fadeMusicForSpeaker({ setVolumeAsync: async v => { cancelled.push(v); active = false; } },
    () => 0.7, () => active, () => true, 200);
  assert.equal(cancelled.at(-1), 0.7);
});

test("fades music down while fading the speaker in and releases the previous sound", async () => {
  const outgoing = [];
  const incoming = [];
  let unloaded = false;
  const old = {
    getStatusAsync: async () => ({ isLoaded: true, volume: 0.8 }),
    setVolumeAsync: async value => outgoing.push(value),
    unloadAsync: async () => { unloaded = true; },
  };
  const next = {
    playAsync: async () => {},
    setVolumeAsync: async value => incoming.push(value),
  };
  await fadeSpeakerTransition(old, next, () => 1, () => true);
  assert.equal(outgoing.length, 10);
  assert.ok(outgoing.every((value, i) => i === 0 || value < outgoing[i - 1]));
  assert.equal(outgoing.at(-1), 0);
  assert.equal(incoming.at(-1), 1);
  assert.equal(unloaded, true);
});

test("releases the previous sound when the transition fails", async () => {
  let unloaded = false;
  const old = {
    getStatusAsync: async () => ({ isLoaded: true, volume: 1 }),
    unloadAsync: async () => { unloaded = true; },
  };
  await assert.rejects(fadeSpeakerTransition(old, { playAsync: async () => { throw new Error("failed"); } }, () => 1, () => true));
  assert.equal(unloaded, true);
});

test("pausing during a fade stops the new sound and restores its volume for resume", async () => {
  let playing = true;
  let paused = false;
  let volume = 0;
  let unloaded = false;
  const old = {
    getStatusAsync: async () => ({ isLoaded: true, volume: 1 }),
    setVolumeAsync: async () => { playing = false; },
    unloadAsync: async () => { unloaded = true; },
  };
  const next = {
    playAsync: async () => {},
    pauseAsync: async () => { paused = true; },
    setVolumeAsync: async value => { volume = value; },
  };
  await fadeSpeakerTransition(old, next, () => 0.8, () => playing);
  assert.equal(paused, true);
  assert.equal(volume, 0.8);
  assert.equal(unloaded, true);
});
