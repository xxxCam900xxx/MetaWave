import test from "node:test";
import assert from "node:assert/strict";
import { lastNewsPreview, newsPreview, parseSpeakerSchedule, safeNewsUrl, speakerQueueNotice } from "./speakerQueue.ts";

const target = "2026-11-19T09:00:00+00:00";
const schedule = { enabled: true, next_broadcast: target, next_broadcast_state: null };

test("shows the Swiss broadcast time and warns when radio is paused", () => {
  const notice = speakerQueueNotice(schedule, false, false, true);
  assert.match(notice.title, /10:00/);
  assert.match(notice.detail, /pausiert/);
  assert.equal(notice.warning, false);
});

test("shows excerpts from a ready or waiting broadcast", () => {
  const ready = { ...schedule, next_broadcast_state: "ready", next_broadcast_script: "Hallo.\n\nErste Meldung.\n\nZweite Meldung.\n\nOutro." };
  assert.deepEqual(newsPreview(ready), ["Erste Meldung.", "Zweite Meldung."]);
  const waiting = { ...ready, next_broadcast_state: "claimed" };
  assert.deepEqual(newsPreview(waiting), ["Erste Meldung.", "Zweite Meldung."]);
  assert.match(speakerQueueNotice(waiting, false, false, false).title, /wartet auf Liedende/);
  assert.deepEqual(newsPreview({ ...ready, next_broadcast_state: "failed" }), []);
});

test("keeps last aired news visible independently of the next prepared broadcast", () => {
  const last = { target, script: "Hallo.\n\nLetzte Meldung.\n\nOutro." };
  const next = { ...schedule, next_broadcast_state: "ready", next_broadcast_script: "Hallo.\n\nNeue Meldung.\n\nOutro.", last_broadcast: last };
  const parsed = parseSpeakerSchedule(next);
  assert.deepEqual(lastNewsPreview(parsed), ["Letzte Meldung."]);
  assert.deepEqual(newsPreview(parsed), ["Neue Meldung."]);
  assert.deepEqual(lastNewsPreview({ ...parsed, enabled: false }), ["Letzte Meldung."]);
  assert.deepEqual(newsPreview({ ...parsed, next_broadcast_state: "preparing" }), []);
  assert.throws(() => parseSpeakerSchedule({ ...next, last_broadcast: { target: "invalid", script: "Text" } }), /Ungültiger/);
});

test("uses the state of the next broadcast, not the last prepared broadcast", () => {
  const failed = { ...schedule, next_broadcast_state: "failed", last_scheduled: { target: "2026-11-19T13:00:00Z", state: "ready" } };
  assert.match(speakerQueueNotice(failed, false, false, false).title, /fällt aus/);
  failed.next_broadcast_state = null;
  failed.last_scheduled.state = "failed";
  assert.match(speakerQueueNotice(failed, false, false, false).detail, /Geplant/);
});

test("handles disabled, unavailable, active and invalid status", () => {
  assert.equal(speakerQueueNotice({ ...schedule, enabled: false }, false, false, false), null);
  assert.equal(speakerQueueNotice(null, true, false, false).warning, true);
  assert.match(speakerQueueNotice(null, true, true, false).title, /Jetzt auf Sendung/);
  assert.throws(() => parseSpeakerSchedule({ enabled: true }), /Ungültiger/);
  assert.deepEqual(parseSpeakerSchedule(schedule), schedule);
});

test("preserves source metadata and refuses unsafe article links", () => {
  const items = [{ title: "Titel", summary: "Inhalt", source: "Quelle", url: "https://example.org/artikel" }];
  const parsed = parseSpeakerSchedule({ ...schedule, next_broadcast_items: items, last_broadcast: { target, script: "Text", items } });
  assert.deepEqual(parsed.next_broadcast_items, items);
  assert.deepEqual(parsed.last_broadcast.items, items);
  assert.throws(() => parseSpeakerSchedule({ ...schedule, next_broadcast_items: [{ title: "Titel" }] }), /Ungültiger/);
  assert.equal(safeNewsUrl(items[0].url), "https://example.org/artikel");
  for (const url of ["javascript:alert(1)", "/relative", "https://user:pass@example.org/", "https://example.org/\nheader", null]) {
    assert.equal(safeNewsUrl(url), null);
  }
});
