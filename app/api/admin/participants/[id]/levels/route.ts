import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queryOne } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { MAX_LEVEL } from "@/lib/levels";
import { getDeclaredLevels, setDeclaredLevels } from "@/lib/participant-levels";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  levels: z.array(z.number().int().min(1).max(MAX_LEVEL)).max(MAX_LEVEL),
});

/** GET: corsi gia' svolti registrati per un partecipante. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Id non valido." }, { status: 400 });

  return NextResponse.json({ declared: await getDeclaredLevels(id) });
}

/**
 * PUT: l'amministratore registra i corsi gia' svolti da un partecipante.
 * L'insieme inviato diventa quello definitivo: puo' quindi anche correggere
 * una dichiarazione sbagliata fatta dal partecipante.
 */
export async function PUT(req: NextRequest, ctx: Ctx) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  const id = Number((await ctx.params).id);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!Number.isInteger(id) || !parsed.success) {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }

  const exists = await queryOne<{ id: number }>(`SELECT id FROM participants WHERE id = $1`, [id]);
  if (!exists) return NextResponse.json({ error: "Partecipante non trovato." }, { status: 404 });

  const declared = await setDeclaredLevels(id, parsed.data.levels, "admin");
  return NextResponse.json({ ok: true, declared });
}
