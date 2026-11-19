import test from "node:test";
import assert from "node:assert/strict";
import { parseSpeakerSchedule, speakerQueueNotice } from "./speakerQueue.ts";

const target = "2026-11-19T09:00:00+00:00";
const schedule = { enabled: true, next_broadcast: target, next_broadcast_state: null };

test("shows the Swiss broadcast time and warns when radio is paused", () => {
  const notice = speakerQueueNotice(schedule, false, false, true);
  assert.match(notice.title, /10:00/);
  assert.match(notice.detail, /pausiert/);
  assert.equal(notice.warning, false);
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
