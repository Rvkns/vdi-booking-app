import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { validateBookingSlot } from "@/lib/booking-rules";
import { getCurrentSession } from "@/lib/session";
import { requireAdmin } from "@/lib/admin-guard";

/**
 * DELETE /api/bookings/:id
 * Sblocca/annulla una prenotazione. Consentito al proprietario dello slot
 * oppure a un amministratore.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Id non valido." }, { status: 400 });

  const isAdmin = await requireAdmin();

  const result = isAdmin
    ? await pool.query(
        `UPDATE bookings SET stato = 'Annullata'
         WHERE id = $1 AND stato = 'Confermata'`,
        [id]
      )
    : await pool.query(
        `UPDATE bookings SET stato = 'Annullata'
         WHERE id = $1 AND participant_id = $2 AND stato = 'Confermata'`,
        [id, session.participantId]
      );

  if (result.rowCount === 0) {
    return NextResponse.json(
      { error: "Prenotazione non trovata, già annullata, o non di tua proprietà." },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true });
}

const moveSchema = z.object({
  start: z.string(),
  end: z.string(),
  note: z.string().max(280).optional(),
});

/**
 * PATCH /api/bookings/:id — modifica orario o nota di una prenotazione.
 * L'UPDATE e' atomico: se il nuovo slot si sovrappone a un altro, il vincolo
 * EXCLUDE del database lo rifiuta (409).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Id non valido." }, { status: 400 });

  const parsed = moveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });

  const slot = validateBookingSlot(parsed.data.start, parsed.data.end);
  if (!slot.ok) return NextResponse.json({ error: slot.error }, { status: 400 });

  const isAdmin = await requireAdmin();

  try {
    const result = isAdmin
      ? await pool.query(
          `UPDATE bookings
           SET slot = tstzrange($1, $2),
               note = COALESCE($4, note)
           WHERE id = $3 AND stato = 'Confermata'`,
          [slot.start.toISOString(), slot.end.toISOString(), id, parsed.data.note ?? null]
        )
      : await pool.query(
          `UPDATE bookings
           SET slot = tstzrange($1, $2),
               note = COALESCE($5, note)
           WHERE id = $3 AND participant_id = $4 AND stato = 'Confermata'`,
          [slot.start.toISOString(), slot.end.toISOString(), id, session.participantId, parsed.data.note ?? null]
        );
    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Prenotazione non trovata, annullata o non di tua proprietà." },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.code === "23P01") {
      return NextResponse.json(
        { error: "Lo slot selezionato si sovrappone a una prenotazione già esistente." },
        { status: 409 }
      );
    }
    console.error(err);
    return NextResponse.json({ error: "Errore durante la modifica." }, { status: 500 });
  }
}
