import db from "../database/DatabaseLogic.js";

let schemaPromise;
export function ensureProgramSchema() {
  if (!schemaPromise) {
    schemaPromise = db.execute(`CREATE TABLE IF NOT EXISTS playlist_program (
      playlist_id INT PRIMARY KEY,
      is_main BOOLEAN NULL UNIQUE,
      start_date CHAR(5) NULL,
      end_date CHAR(5) NULL,
      start_time CHAR(5) NOT NULL DEFAULT '00:00',
      end_time CHAR(5) NOT NULL DEFAULT '00:00',
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    )`).catch(error => { schemaPromise = null; throw error; });
  }
  return schemaPromise;
}

export async function getAllPlaylists() {
  await ensureProgramSchema();
  return db.execute(
    `SELECT p.id, p.name, p.url, p.is_active, p.created_at, p.updated_at,
      COALESCE(s.is_main, 0) AS is_main, s.start_date, s.end_date,
      COALESCE(s.start_time, '00:00') AS start_time, COALESCE(s.end_time, '00:00') AS end_time
     FROM playlists p LEFT JOIN playlist_program s ON s.playlist_id = p.id ORDER BY p.created_at DESC`
  );
}

export async function setPlaylistProgram(id, updates) {
  const { is_main, start_date, end_date, start_time, end_time } = updates;
  const { validAnnualDate, validTime } = await import("./PlaylistProgram.js");
  if (typeof is_main !== "boolean" ||
      (!is_main && (!validAnnualDate(start_date) || !validAnnualDate(end_date) ||
       !validTime(start_time) || !validTime(end_time)))) {
    throw new Error("INVALID_PROGRAM");
  }
  await ensureProgramSchema();
  await db.transaction(async connection => {
    const [rows] = await connection.execute("SELECT id FROM playlists WHERE id = ? FOR UPDATE", [id]);
    if (!rows.length) throw new Error("NOT_FOUND");
    if (!is_main) {
      const [current] = await connection.execute(
        "SELECT playlist_id FROM playlist_program WHERE playlist_id = ? AND is_main = TRUE FOR UPDATE", [id]
      );
      if (current.length) throw new Error("MAIN_MUST_BE_ACTIVE");
    }
    if (is_main) await connection.execute("UPDATE playlist_program SET is_main = NULL WHERE is_main = TRUE");
    await connection.execute(
      `INSERT INTO playlist_program (playlist_id, is_main, start_date, end_date, start_time, end_time)
       VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE is_main = VALUES(is_main),
       start_date = VALUES(start_date), end_date = VALUES(end_date),
       start_time = VALUES(start_time), end_time = VALUES(end_time)`,
      [id, is_main ? 1 : null, is_main ? null : start_date, is_main ? null : end_date,
        is_main ? "00:00" : start_time, is_main ? "00:00" : end_time]
    );
    if (is_main) await connection.execute("UPDATE playlists SET is_active = TRUE WHERE id = ?", [id]);
  });
}

export async function getActivePlaylists() {
  return db.execute(
    "SELECT id, name, url FROM playlists WHERE is_active = TRUE ORDER BY created_at ASC"
  );
}

export async function addPlaylist(name, url) {
  if (!name || !url) throw new Error("INVALID_INPUT");
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("INVALID_URL");
  }
  if (parsed.hostname === "spotify.com" || parsed.hostname.endsWith(".spotify.com")) {
    throw new Error("SPOTIFY_UNSUPPORTED");
  }
  try {
    const result = await db.execute(
      "INSERT INTO playlists (name, url) VALUES (?, ?)",
      [name.trim(), url.trim()]
    );
    return { id: result.insertId, name: name.trim(), url: url.trim(), is_active: true };
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw new Error("PLAYLIST_EXISTS");
    throw err;
  }
}

export async function updatePlaylist(id, updates) {
  const { name, url, is_active } = updates;
  const fields = [];
  const params = [];

  if (name !== undefined) {
    fields.push("name = ?");
    params.push(name.trim());
  }
  if (url !== undefined) {
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error("INVALID_URL"); }
    if (parsed.hostname === "spotify.com" || parsed.hostname.endsWith(".spotify.com")) {
      throw new Error("SPOTIFY_UNSUPPORTED");
    }
    fields.push("url = ?");
    params.push(url.trim());
  }
  if (is_active !== undefined) {
    if (!is_active) {
      await ensureProgramSchema();
      const main = await db.execute("SELECT playlist_id FROM playlist_program WHERE playlist_id = ? AND is_main = TRUE", [id]);
      if (main.length) throw new Error("MAIN_MUST_BE_ACTIVE");
    }
    fields.push("is_active = ?");
    params.push(is_active ? 1 : 0);
  }

  if (!fields.length) throw new Error("NO_CHANGES");

  params.push(id);
  const result = await db.execute(
    `UPDATE playlists SET ${fields.join(", ")} WHERE id = ?`,
    params
  );
  if (result.affectedRows === 0) throw new Error("NOT_FOUND");
  return result;
}

export async function deletePlaylist(id) {
  const result = await db.execute("DELETE FROM playlists WHERE id = ?", [id]);
  if (result.affectedRows === 0) throw new Error("NOT_FOUND");
  return result;
}
