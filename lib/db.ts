import { Pool } from "pg";

// Pool condiviso: in ambiente serverless (Vercel) e' importante non creare
// una nuova connessione ad ogni invocazione. Next.js riusa il modulo tra le
// invocazioni "calde" della stessa funzione, quindi il pool viene creato
// una sola volta grazie a questa guardia su globalThis.
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

/**
 * Nomi sotto cui puo' arrivare la stringa di connessione. I database creati
 * dalla dashboard Vercel (Neon, Supabase, Vercel Postgres) iniettano nomi
 * propri: accettarli tutti evita di dover duplicare a mano la variabile.
 */
const CONNECTION_ENV_VARS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
] as const;

export function getConnectionString(): string | undefined {
  for (const name of CONNECTION_ENV_VARS) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

function createPool() {
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error(
      `Stringa di connessione Postgres non impostata. Configura una di queste ` +
        `variabili d'ambiente: ${CONNECTION_ENV_VARS.join(", ")}.`
    );
  }
  return new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
    max: 5,
  });
}

// Creazione lazy: il modulo viene importato anche durante `next build`
// (page data collection), quando DATABASE_URL puo' non essere disponibile.
function getPool(): Pool {
  if (!globalThis.__pgPool) globalThis.__pgPool = createPool();
  return globalThis.__pgPool;
}

export const pool = new Proxy({} as Pool, {
  get(_t, prop) {
    const p = getPool();
    const v = (p as any)[prop];
    return typeof v === "function" ? v.bind(p) : v;
  },
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
