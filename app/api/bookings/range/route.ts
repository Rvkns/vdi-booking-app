import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { dayBounds, isValidDateString } from "@/lib/slots";
import { addDays } from "@/lib/calendar";

/**
 * GET /api/bookings/range?from=YYYY-MM-DD&to=YYYY-MM-DD (to incluso)
 * Prenotazioni confermate nell'intervallo, comprensive del nome e cognome
 * della persona che ha bloccato lo slot (visibile a tutti gli utenti).
 */
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });

  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  if (!isValidDateString(from) || !isValidDateString(to) || to < from || to > addDays(from, 400)) {
    return NextResponse.json({ error: "Intervallo non valido." }, { status: 400 });
  }

  const resource = await queryOne<{ id: number }>(
    `SELECT id FROM vdi_resources WHERE code = $1 AND is_active = true`,
    [process.env.VDI_RESOURCE_CODE ?? "VDI-AI-01"]
  );
  if (!resource) return NextResponse.json({ error: "Risorsa VDI non configurata." }, { status: 500 });

  const rows = await query<{
    id: number;
    participant_id: number;
    start: Date;
    end: Date;
    nome: string;
    cognome: string;
    username: string;
    note: string | null;
  }>(
    `SELECT b.id, b.participant_id, lower(b.slot) AS start, upper(b.slot) AS "end",
            p.nome, p.cognome, p.username, b.note
     FROM bookings b
     JOIN participants p ON p.id = b.participant_id
     WHERE b.resource_id = $1 AND b.stato = 'Confermata' AND b.slot && tstzrange($2, $3)
     ORDER BY lower(b.slot)`,
    [resource.id, dayBounds(from).start.toISOString(), dayBounds(to).end.toISOString()]
  );

  return NextResponse.json({
    bookings: rows.map((r) => ({
      id: r.id,
      start: r.start,
      end: r.end,
      mine: r.participant_id === session.participantId,
      participantName: `${r.nome} ${r.cognome}`,
      username: r.username,
      note: r.note,
    })),
  });
}
