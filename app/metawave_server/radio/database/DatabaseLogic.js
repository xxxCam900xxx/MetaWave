import mysql from "mysql2/promise";

/*
  ENV Variablen prüfen
*/
const {
  DB_HOST,
  DB_USER,
  DB_PASS,
  DB_NAME
} = process.env;

if (!DB_HOST || !DB_USER || !DB_PASS || !DB_NAME) {
  throw new Error("Datenbankverbindungsinformationen nicht gesetzt.");
}

/*
  Connection Pool (besser als einzelne Connections)
*/
const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

/*
  Zentrale Execute Methode
*/
async function execute(query, params = []) {
  try {
    const [rows] = await pool.execute(query, params);
    return rows;
  } catch (err) {
    console.error("DB Fehler:", err.message);
    throw err;
  }
}

/*
  Optional: Transaction Support
*/
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

export default {
  execute,
  transaction
};