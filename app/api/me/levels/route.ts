import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/session";
import { LEVELS, MAX_LEVEL } from "@/lib/levels";
import { getDeclaredLevels, setDeclaredLevels } from "@/lib/participant-levels";

const schema = z.object({
  levels: z.array(z.number().int().min(1).max(MAX_LEVEL)).max(MAX_LEVEL),
});

/** GET /api/me/levels — i corsi che risultano gia' svolti per l'utente corrente. */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });

  const declared = await getDeclaredLevels(session.participantId);
  return NextResponse.json({ declared, catalog: LEVELS });
}

/**
 * PUT /api/me/levels — il partecipante dichiara quali corsi ha gia' svolto.
 * Puo' aggiungere e togliere solo le proprie dichiarazioni: quelle inserite
 * da un amministratore non sono modificabili da qui.
 */
export async function PUT(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }

  const declared = await setDeclaredLevels(session.participantId, parsed.data.levels, "self");
  return NextResponse.json({ ok: true, declared });
}
