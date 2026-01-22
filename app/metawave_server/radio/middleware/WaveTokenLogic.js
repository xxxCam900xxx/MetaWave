// generiert den aktuellen Monatscode
export function getMonthlyCode() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  
  return `MW${year}${month.toString().padStart(2, "0")}-RADIO`;
}

import db from "../database/DatabaseLogic.js";

// Liefert den in der DB gespeicherten Token für den aktuellen Monat (oder null)
export async function getStoredTokenForCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  try {
    const rows = await db.execute(`SELECT token FROM wave_tokens WHERE year = ? AND month = ? LIMIT 1`, [year, month]);
    if (Array.isArray(rows) && rows[0] && (rows[0].token || rows[0].TOKEN)) return rows[0].token || rows[0].TOKEN;
    return null;
  } catch (err) {
    console.error("getStoredTokenForCurrentMonth: DB error", err);
    return null;
  }
}