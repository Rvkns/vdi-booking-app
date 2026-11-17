import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { isAdminUsername } from "@/lib/config";
import {
  buildUsername,
  generateTemporaryPassword,
  hashPassword,
  slugifyName,
} from "@/lib/auth";
import { computeProgress, MAX_LEVEL, type LessonRef } from "@/lib/levels";
import { encryptPassword } from "@/lib/vault";
import {
  getDeclaredLevelsByParticipant,
  sanitizeLevels,
  setDeclaredLevels,
} from "@/lib/participant-levels";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });

  const rows = await query<any>(
    `SELECT id, source_id, nome, cognome, username, tipo_utente,
            is_active, must_reset_password, updated_at, livello_atteso, livello_affrontato,
            to_char(data_nascita, 'YYYY-MM-DD') AS data_nascita,
            COALESCE(is_admin, false) AS is_admin,
            (password_enc IS NOT NULL) AS has_password
     FROM participants ORDER BY cognome, nome`
  );
  const lessonRows = await query<any>(
    `SELECT lp.participant_id, lp.lesson_id, lp.attended, l.level, lower(l.slot) AS start, upper(l.slot) AS "end"
     FROM lesson_participants lp JOIN lessons l ON l.id = lp.lesson_id`
  );
  const byPerson = new Map<number, LessonRef[]>();
  for (const r of lessonRows) {
    const list = byPerson.get(r.participant_id) ?? [];
    list.push({ lessonId: r.lesson_id, level: r.level, start: r.start, end: r.end, attended: r.attended });
    byPerson.set(r.participant_id, list);
  }

  const declaredByPerson = await getDeclaredLevelsByParticipant();

  const participants = rows.map((p) => {
    const declared = declaredByPerson.get(p.id) ?? [];
    const progress = computeProgress(
      { atteso: p.livello_atteso, affrontato: p.livello_affrontato, declared },
      byPerson.get(p.id) ?? []
    );
    return {
      ...p,
      is_admin: Boolean(p.is_admin || isAdminUsername(p.username)),
      declared,
      done: progress.done,
      scheduled: progress.scheduled,
      next: progress.next,
      recommended: progress.recommended,
    };
  });
  return NextResponse.json({ participants });
}

const createSchema = z.object({
  nome: z.string().trim().min(1, "Nome mancante.").max(60),
  cognome: z.string().trim().min(1, "Cognome mancante.").max(60),
  tipoUtente: z.enum(["TMI", "External"]).default("TMI"),
  livelloAtteso: z.number().int().min(1).max(MAX_LEVEL).nullish(),
  /** corsi che la persona ha gia' svolto, registrati dall'amministratore */
  levels: z.array(z.number().int().min(1).max(MAX_LEVEL)).max(MAX_LEVEL).optional(),
});

/**
 * POST — inserisce un singolo partecipante, in alternativa all'import CSV.
 *
 * La riga nasce senza data di nascita: la persona completa il profilo
 * registrandosi da sola e scegliendo la propria password (la registrazione
 * accetta solo chi e' gia' in elenco). In alternativa puoi consegnarle la
 * password temporanea restituita qui, che va cambiata al primo accesso.
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dati non validi." },
      { status: 400 }
    );
  }
  const { nome, cognome, tipoUtente, livelloAtteso } = parsed.data;

  if (!slugifyName(nome) || !slugifyName(cognome)) {
    return NextResponse.json(
      { error: "Nome e cognome devono contenere almeno una lettera." },
      { status: 400 }
    );
  }

  const taken = await query<{ username: string }>(`SELECT username FROM participants`);
  const username = buildUsername(nome, cognome, new Set(taken.map((r) => r.username)));

  const tempPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(tempPassword);

  let created: { id: number } | null = null;
  try {
    created = await queryOne<{ id: number }>(
      `INSERT INTO participants
         (source_id, nome, cognome, username, tipo_utente,
          password_hash, password_enc, must_reset_password, is_active,
          livello_atteso, livello_affrontato, is_admin)
       VALUES (NULL, $1, $2, $3, $4, $5, $6, true, true, $7, 0, $8)
       RETURNING id`,
      [
        nome, cognome, username, tipoUtente,
        passwordHash, encryptPassword(tempPassword),
        livelloAtteso ?? null, isAdminUsername(username),
      ]
    );
  } catch (e: any) {
    // 23505 = unique_violation sullo username (inserimenti in parallelo)
    if (e?.code === "23505") {
      return NextResponse.json(
        { error: "Nome utente già esistente: riprova." },
        { status: 409 }
      );
    }
    throw e;
  }
  if (!created) return NextResponse.json({ error: "Inserimento non riuscito." }, { status: 500 });

  const levels = sanitizeLevels(parsed.data.levels ?? []);
  const declared = levels.length ? await setDeclaredLevels(created.id, levels, "admin") : [];

  return NextResponse.json(
    {
      ok: true,
      participant: { id: created.id, nome, cognome, username, tipo_utente: tipoUtente },
      temporaryPassword: tempPassword,
      declared,
    },
    { status: 201 }
  );
}
