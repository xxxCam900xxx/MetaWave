import db from "../database/DatabaseLogic.js";

export async function getAllPlaylists() {
  return db.execute(
    "SELECT id, name, url, is_active, created_at, updated_at FROM playlists ORDER BY created_at DESC"
  );
}

export async function getActivePlaylists() {
  return db.execute(
    "SELECT id, name, url FROM playlists WHERE is_active = TRUE ORDER BY created_at ASC"
  );
}

export async function addPlaylist(name, url) {
  if (!name || !url) throw new Error("INVALID_INPUT");
  try {
    new URL(url);
  } catch {
    throw new Error("INVALID_URL");
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
    try { new URL(url); } catch { throw new Error("INVALID_URL"); }
    fields.push("url = ?");
    params.push(url.trim());
  }
  if (is_active !== undefined) {
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
