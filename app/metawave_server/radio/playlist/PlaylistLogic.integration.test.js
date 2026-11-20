import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";

test("playlist API migrates existing databases and persists annual schedules", {
  skip: process.env.PLAYLIST_TEST_DB !== "1",
}, async () => {
  process.env.DB_HOST = "127.0.0.1";
  process.env.DB_USER = "root";
  process.env.DB_PASS = "integration-test-only";
  process.env.DB_NAME = "database_metawave";
  process.env.AUTH_SECRET = "integration-test-only";
  const createPool = mysql.createPool;
  let pool;
  mysql.createPool = options => {
    pool = createPool({ ...options, port: Number(process.env.PLAYLIST_TEST_PORT) });
    return pool;
  };
  const { default: router } = await import("./PlaylistRouter.js");
  mysql.createPool = createPool;
  const app = express();
  app.use(express.json(), router);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    Authorization: `Bearer ${jwt.sign({ scope: "stream" }, process.env.AUTH_SECRET)}`,
    "Content-Type": "application/json",
  };
  const request = (url, method = "GET", body) => fetch(base + url, {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try {
    const first = await request("/", "POST", { name: "Main", url: "https://youtube.com/playlist?list=main" });
    assert.equal(first.status, 201);
    const firstId = (await first.json()).playlist.id;
    const second = await request("/", "POST", { name: "Christmas", url: "https://youtube.com/playlist?list=season" });
    assert.equal(second.status, 201);
    const secondId = (await second.json()).playlist.id;
    assert.equal((await request(`/${firstId}/program`, "PUT", { is_main: true })).status, 200);
    assert.equal((await request(`/${secondId}/program`, "PUT", {
      is_main: false, start_date: "11-25", start_time: "08:00", end_date: "01-06", end_time: "18:00",
    })).status, 200);
    let rows = (await (await request("/")).json()).playlists;
    assert.equal(rows.find(row => row.id === firstId).is_main, 1);
    assert.equal(rows.find(row => row.id === secondId).end_date, "01-06");
    assert.equal((await request(`/${firstId}`, "PUT", { is_active: false })).status, 409);
    assert.equal((await request(`/${firstId}/program`, "PUT", {
      is_main: false, start_date: "11-25", start_time: "00:00", end_date: "12-27", end_time: "00:00",
    })).status, 409);
    assert.equal((await request(`/${secondId}/program`, "PUT", {
      is_main: false, start_date: "02-30", start_time: "00:00", end_date: "03-01", end_time: "00:00",
    })).status, 400);
    assert.equal((await request("/", "POST", { name: "Spotify", url: "https://open.spotify.com/playlist/abc" })).status, 400);
    assert.equal((await request(`/${secondId}/program`, "PUT", { is_main: true })).status, 200);
    rows = (await (await request("/")).json()).playlists;
    assert.equal(rows.filter(row => row.is_main).length, 1);
    assert.equal(rows.find(row => row.id === secondId).is_main, 1);
    assert.equal((await request(`/${secondId}`, "DELETE")).status, 200);
    const [remaining] = await pool.execute("SELECT COUNT(*) AS count FROM playlist_program WHERE playlist_id = ?", [secondId]);
    assert.equal(remaining[0].count, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
});
