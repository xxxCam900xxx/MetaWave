import mysql from "mysql2/promise";

const {
  DB_HOST,
  DB_USER,
  DB_PASS,
  DB_NAME
} = process.env;

if (!DB_HOST || !DB_USER || !DB_PASS || !DB_NAME) {
  throw new Error("Datenbankverbindungsinformationen nicht gesetzt.");
}

// Connection Pool
const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Centralized query execution
async function execute(query, params = []) {
  try {
    const [rows] = await pool.execute(query, params);
    return rows;
  } catch (err) {
    console.error("DB Fehler:", err.message);
    throw err;
  }
}

// Transaction helper
async function transaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// Wave token helpers
export async function tokenExists(year, month) {
  const rows = await execute(`SELECT COUNT(*) as cnt FROM wave_tokens WHERE year = ? AND month = ?`, [year, month]);
  const cnt = Array.isArray(rows) && rows[0] && (rows[0].cnt || rows[0].COUNT || rows[0].count) ? (rows[0].cnt || rows[0].COUNT || rows[0].count) : rows[0]["cnt"] || 0;
  return Number(cnt) > 0;
}

export async function getStoredToken(year, month) {
  const rows = await execute(`SELECT token FROM wave_tokens WHERE year = ? AND month = ? LIMIT 1`, [year, month]);
  if (Array.isArray(rows) && rows[0] && (rows[0].token || rows[0].TOKEN)) return rows[0].token || rows[0].TOKEN;
  return null;
}

export async function storeWaveToken(token) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  await execute(`INSERT INTO wave_tokens (token, year, month) VALUES (?, ?, ?)`, [token, year, month]);
}

export default {
  execute,
  transaction
};