// Esegue schema.sql contro il database indicato in DATABASE_URL.
// Uso: npm run db:init
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { config as loadEnv } from "dotenv";

// Stessa precedenza di Next.js: .env.local vince su .env.
// (dotenv non sovrascrive le variabili gia' definite.)
loadEnv({ path: ".env.local" });
loadEnv();

const sql = readFileSync(new URL("../schema.sql", import.meta.url), "utf-8");

// Stessi nomi accettati da lib/db.ts (i DB creati dalla dashboard Vercel
// iniettano POSTGRES_URL o DATABASE_URL_UNPOOLED invece di DATABASE_URL).
const connectionString = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
]
  .map((name) => process.env[name]?.trim())
  .find((value) => value);

if (!connectionString) {
  console.error(
    "Stringa di connessione Postgres non impostata: valorizza DATABASE_URL (o POSTGRES_URL) in .env.local."
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

try {
  await pool.query(sql);
  console.log("Schema applicato con successo.");
} catch (err) {
  console.error("Errore durante l'applicazione dello schema:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
