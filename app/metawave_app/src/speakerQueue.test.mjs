import test from "node:test";
import assert from "node:assert/strict";
import { lastNewsPreview, newsPreview, parseSpeakerSchedule, recentSpeakerWarning, safeNewsUrl, speakerQueueNotice } from "./speakerQueue.ts";

const target = "2026-11-19T09:00:00+00:00";
const schedule = { enabled: true, next_broadcast: target, next_broadcast_state: null };

test("shows the Swiss broadcast time and warns when radio is paused", () => {
  const notice = speakerQueueNotice(schedule, false, false, true, Date.parse(target) - 7200000);
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
  assert.match(speakerQueueNotice(failed, false, false, false, Date.parse(target) - 7200000).detail, /Geplant/);
});

test("handles disabled, unavailable, active and invalid status", () => {
  assert.match(speakerQueueNotice({ ...schedule, enabled: false }, false, false, false).title, /Deaktiviert/);
  assert.equal(speakerQueueNotice(null, true, false, false).warning, true);
  assert.match(speakerQueueNotice(null, true, true, false).title, /Jetzt auf Sendung/);
  assert.throws(() => parseSpeakerSchedule({ enabled: true }), /Ungültiger/);
  assert.deepEqual(parseSpeakerSchedule(schedule), schedule);
});

test("shows scheduled preparation, readiness and missing preparation without confusing a manual preview", () => {
  const now = Date.parse(target) - 7200000;
  const scheduled = { ...schedule, next_prepare: "2026-11-19T08:00:00+00:00" };
  assert.match(speakerQueueNotice(scheduled, false, false, false, now).detail, /09:00/);
  const preparing = parseSpeakerSchedule({ ...scheduled, next_broadcast_state: "preparing",
    job: { state: "preparing", scheduled: true, target } });
  assert.match(speakerQueueNotice(preparing, false, false, false, now).title, /Sendung wird erstellt/);
  assert.equal(speakerQueueNotice(preparing, false, false, false, now).busy, true);
  const ready = { ...preparing, next_broadcast_state: "ready" };
  assert.match(speakerQueueNotice(ready, false, false, false, now).title, /bereit/);
  assert.match(speakerQueueNotice(ready, false, false, true, now).detail, /pausiert/);
  const preview = { ...scheduled, job: { state: "preparing", scheduled: false, target } };
  assert.match(speakerQueueNotice(preview, false, false, false, now).title, /Vorschau/);
  assert.match(speakerQueueNotice({ ...ready, job: preview.job }, false, false, false, now).detail, /Vorschau/);
  const missedPreparation = speakerQueueNotice(preview, false, false, false, Date.parse(target) - 1800000);
  assert.equal(missedPreparation.warning, true);
  assert.match(missedPreparation.detail, /manuelle Vorschau/);
  assert.throws(() => parseSpeakerSchedule({ ...schedule, job: { state: "preparing", target } }), /Ungültiger/);
});

test("reports transition progress and recent failures without treating old failures as current", () => {
  const claimed = { ...schedule, next_broadcast_state: "claimed", transition_state: "preparing" };
  assert.equal(speakerQueueNotice(claimed, false, false, false).busy, true);
  assert.match(speakerQueueNotice(claimed, false, false, false).detail, /Songansagen werden erstellt/);
  assert.equal(speakerQueueNotice({ ...claimed, transition_state: "ready" }, false, false, false).busy, false);
  const now = Date.parse(target) + 60000;
  const failed = { ...schedule, last_scheduled: { state: "failed", target } };
  assert.match(recentSpeakerWarning(failed, now), /ausgefallen/);
  assert.equal(recentSpeakerWarning(failed, now + 24 * 3600000), null);
  assert.equal(recentSpeakerWarning({ ...failed, last_broadcast: { target: "2026-11-19T10:00:00Z", script: "OK" } }, now), null);
  assert.match(recentSpeakerWarning({ ...failed, last_scheduled: { state: "uncertain", target } }, now), /nicht bestätigt/);
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
