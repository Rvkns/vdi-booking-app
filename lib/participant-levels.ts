import { pool, query } from "@/lib/db";
import { MAX_LEVEL } from "@/lib/levels";

/**
 * Corsi/livelli dichiarati come gia' svolti (tabella participant_levels).
 * 'self'  = dichiarato dal partecipante dal proprio profilo
 * 'admin' = inserito da un amministratore
 *
 * Un partecipante puo' gestire solo le proprie dichiarazioni 'self': quelle
 * inserite da un admin restano, cosi' non puo' cancellare una registrazione
 * ufficiale. L'admin invece ha l'ultima parola su tutto l'insieme.
 */
export type DeclaredLevel = { level: number; source: "self" | "admin"; note: string | null };

export function sanitizeLevels(levels: number[]): number[] {
  return Array.from(new Set(levels))
    .filter((l) => Number.isInteger(l) && l >= 1 && l <= MAX_LEVEL)
    .sort((a, b) => a - b);
}

export async function getDeclaredLevels(participantId: number): Promise<DeclaredLevel[]> {
  return query<DeclaredLevel>(
    `SELECT level, source, note FROM participant_levels WHERE participant_id = $1 ORDER BY level`,
    [participantId]
  );
}

/** Mappa participant_id -> livelli dichiarati, per le viste di elenco. */
export async function getDeclaredLevelsByParticipant(): Promise<Map<number, number[]>> {
  const rows = await query<{ participant_id: number; level: number }>(
    `SELECT participant_id, level FROM participant_levels ORDER BY participant_id, level`
  );
  const map = new Map<number, number[]>();
  for (const r of rows) {
    const list = map.get(r.participant_id) ?? [];
    list.push(r.level);
    map.set(r.participant_id, list);
  }
  return map;
}

/**
 * Riscrive l'insieme dei livelli dichiarati.
 * - source 'self': tocca solo le righe 'self', lasciando intatte quelle 'admin'
 * - source 'admin': l'insieme finale e' esattamente `levels` (l'admin decide)
 *
 * I livelli che restano conservano la provenienza originale, cosi' la UI
 * continua a distinguere chi li ha inseriti.
 */
export async function setDeclaredLevels(
  participantId: number,
  levels: number[],
  source: "self" | "admin"
): Promise<DeclaredLevel[]> {
  const wanted = sanitizeLevels(levels);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (source === "self") {
      await client.query(
        `DELETE FROM participant_levels
         WHERE participant_id = $1 AND source = 'self' AND NOT (level = ANY($2::int[]))`,
        [participantId, wanted]
      );
    } else {
      await client.query(
        `DELETE FROM participant_levels
         WHERE participant_id = $1 AND NOT (level = ANY($2::int[]))`,
        [participantId, wanted]
      );
    }
    if (wanted.length) {
      await client.query(
        `INSERT INTO participant_levels (participant_id, level, source)
         SELECT $1, unnest($2::int[]), $3
         ON CONFLICT (participant_id, level) DO NOTHING`,
        [participantId, wanted, source]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return getDeclaredLevels(participantId);
}
