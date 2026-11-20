import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProgramQueue, inAnnualWindow, validAnnualDate, validTime } from "./PlaylistProgram.js";

const season = {
  id: 2, is_active: 1, is_main: 0,
  start_date: "11-25", start_time: "08:00", end_date: "01-06", end_time: "18:00",
};
const main = { id: 1, is_active: 1, is_main: 1 };
const songs = ["a", "b", "c", "d", "x", "y"].map(id => ({ id, filename: `${id}.mp3` }));
const memberships = { 1: ["a", "b", "c", "d"], 2: ["a", "x", "y"] };

test("annual windows handle Zurich boundaries, year changes and DST", () => {
  assert.equal(inAnnualWindow(season, new Date("2026-11-25T06:59:00Z")), false);
  assert.equal(inAnnualWindow(season, new Date("2026-11-25T07:00:00Z")), true);
  assert.equal(inAnnualWindow(season, new Date("2026-12-01T06:59:00Z")), false);
  assert.equal(inAnnualWindow(season, new Date("2027-01-06T16:59:00Z")), true);
  assert.equal(inAnnualWindow(season, new Date("2027-01-06T17:00:00Z")), false);
  const summer = { start_date: "03-29", start_time: "03:00", end_date: "03-30", end_time: "00:00" };
  assert.equal(inAnnualWindow(summer, new Date("2026-03-29T00:59:00Z")), false);
  assert.equal(inAnnualWindow(summer, new Date("2026-03-29T01:00:00Z")), true);
  assert.equal(validAnnualDate("02-29"), true);
  assert.equal(validAnnualDate("02-30"), false);
  assert.equal(validTime("24:00"), false);
});

test("daily overnight windows belong to the day they started, including year boundaries", () => {
  const night = { start_date: "12-31", end_date: "12-31", start_time: "20:00", end_time: "02:00" };
  assert.equal(inAnnualWindow(night, new Date("2026-12-31T19:00:00Z")), true);
  assert.equal(inAnnualWindow(night, new Date("2027-01-01T00:59:00Z")), true);
  assert.equal(inAnnualWindow(night, new Date("2027-01-01T01:00:00Z")), false);
  assert.equal(inAnnualWindow(night, new Date("2026-12-31T00:00:00Z")), false);
  const allDay = { ...night, start_time: "00:00", end_time: "00:00" };
  assert.equal(inAnnualWindow(allDay, new Date("2026-12-31T12:00:00Z")), true);
  assert.equal(inAnnualWindow(allDay, new Date("2027-01-01T12:00:00Z")), false);
});
test("mixes seasonal songs only within the configured period without duplicates", () => {
  const shuffle = items => items;
  const winter = buildProgramQueue(songs, memberships, [main, season], null, shuffle, new Date("2026-12-01T12:00:00Z"));
  assert.deepEqual(winter.map(song => song.id), ["a", "b", "c", "x", "d"]);
  const summer = buildProgramQueue(songs, memberships, [main, season], null, shuffle, new Date("2026-07-01T12:00:00Z"));
  assert.deepEqual(summer.map(song => song.id), ["a", "b", "c", "d"]);
  assert.equal(buildProgramQueue(songs, {}, [main, season], null, shuffle), null);
});

test("retains the currently playing track and excludes disabled seasons", () => {
  const current = songs[4];
  const result = buildProgramQueue(songs, memberships, [main, { ...season, is_active: 0 }], current,
    items => items, new Date("2026-12-01T12:00:00Z"));
  assert.deepEqual(result.map(song => song.id), ["x", "a", "b", "c", "d"]);
});
