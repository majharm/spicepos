import mysql from "mysql2/promise";

function fromUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, "")),
  };
}

const creds = process.env.DATABASE_URL
  ? fromUrl(process.env.DATABASE_URL)
  : {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    };

const pool = mysql.createPool({
  ...creds,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL || 8),
  charset: "utf8mb4",
  timezone: "Z",
  ssl: process.env.DB_SSL === "1" ? { rejectUnauthorized: false } : undefined,
});

export const BUSINESS_ID =
  process.env.BUSINESS_ID || "00000000-0000-4000-8000-000000000001";

export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export default pool;
