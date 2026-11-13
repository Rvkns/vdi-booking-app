"use client";

import * as React from "react";
import { fromZonedTime } from "date-fns-tz";
import { Calendar, Clock, Lock, Trash2, UserCheck, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { isBookableDay } from "@/lib/holidays";
import { BOOKING_HORIZON_END, DAY_END_HOUR, DAY_START_HOUR, TIMEZONE, romeDateString } from "@/lib/slots";
import { fmtMinutes, longDate, romeMinutes, romeTime, startOfWeek, todayRome } from "@/lib/calendar";

/** Prenotazione esistente selezionata, oppure null per una nuova. */
export type EditingBooking = {
  id: number;
  start: string;
  end: string;
  mine?: boolean;
  canEdit?: boolean;
  participantName?: string;
  note?: string | null;
} | null;

type DayBooking = {
  id: number;
  startMs: number;
  endMs: number;
  startMin: number;
  endMin: number;
  participantName: string;
  mine: boolean;
  note?: string | null;
};

// Opzioni orarie a passi di 30 minuti (09:00 .. 18:00), stile Microsoft Teams
const TIME_OPTIONS = Array.from(
  { length: (DAY_END_HOUR - DAY_START_HOUR) * 2 + 1 },
  (_, i) => fmtMinutes(DAY_START_HOUR * 60 + i * 30)
);

function parseTimeMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * Modal in stile Microsoft Teams Calendar per bloccare uno slot VDI
 * (singola ora o più ore consecutive), modificarlo o visualizzare chi lo occupa.
 */
export function BookingDialog({
  booking,
  initialDate,
  initialStartTime,
  initialEndTime,
  onClose,
  onDone,
}: {
  booking: EditingBooking;
  initialDate: string;
  initialStartTime?: string;
  initialEndTime?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const today = todayRome();
  const minAllowedDate = startOfWeek(today);
  const canEditBooking = booking ? Boolean(booking.canEdit ?? booking.mine) : true;

  const defaultStart = React.useMemo(() => {
    if (booking) return romeTime(new Date(booking.start));
    return initialStartTime ?? "09:00";
  }, [booking, initialStartTime]);

  const defaultEnd = React.useMemo(() => {
    if (booking) return romeTime(new Date(booking.end));
    if (initialEndTime) return initialEndTime;
    const sMin = parseTimeMin(initialStartTime ?? "09:00");
    return fmtMinutes(Math.min(DAY_END_HOUR * 60, sMin + 30));
  }, [booking, initialStartTime, initialEndTime]);

  const [date, setDate] = React.useState(initialDate);
  const [startTime, setStartTime] = React.useState(defaultStart);
  const [endTime, setEndTime] = React.useState(defaultEnd);
  const [note, setNote] = React.useState(booking?.note ?? "");
  const [dayBookings, setDayBookings] = React.useState<DayBooking[] | null>(null);
  const [reload, setReload] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = React.useState(false);

  const validDate = date >= minAllowedDate && date <= BOOKING_HORIZON_END && isBookableDay(date);

  // Carica le prenotazioni già presenti nel giorno selezionato
  React.useEffect(() => {
    if (!validDate) {
      setDayBookings([]);
      return;
    }
    let cancelled = false;
    setDayBookings(null);
    fetch(`/api/bookings/range?from=${date}&to=${date}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Impossibile caricare la disponibilità.");
        if (cancelled) return;
        const list: DayBooking[] = (
          data.bookings as {
            id: number;
            start: string;
            end: string;
            mine: boolean;
            participantName?: string;
            note?: string | null;
          }[]
        )
          .filter((b) => b.id !== booking?.id)
          .map((b) => {
            const s = new Date(b.start);
            const e = new Date(b.end);
            return {
              id: b.id,
              startMs: s.getTime(),
              endMs: e.getTime(),
              startMin: romeMinutes(s),
              endMin: romeMinutes(e),
              participantName: b.participantName ?? "Utente",
              mine: b.mine,
              note: b.note,
            };
          });
        setDayBookings(list);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setDayBookings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [date, validDate, booking?.id, reload]);

  const startMin = parseTimeMin(startTime);
  const endMin = parseTimeMin(endTime);

  // Se l'utente sposta l'ora di inizio oltre quella di fine, aggiorna automaticamente la fine (+30m)
  function handleStartTimeChange(nextStart: string) {
    setStartTime(nextStart);
    const nextStartMin = parseTimeMin(nextStart);
    if (endMin <= nextStartMin) {
      setEndTime(fmtMinutes(Math.min(DAY_END_HOUR * 60, nextStartMin + 30)));
    }
  }

  // Controlla se l'intervallo [startMin, endMin) si sovrappone a uno slot già bloccato
  const overlapping = React.useMemo(() => {
    if (!dayBookings) return null;
    return dayBookings.find((b) => startMin < b.endMin && endMin > b.startMin) ?? null;
  }, [dayBookings, startMin, endMin]);

  const durationMinutes = Math.max(0, endMin - startMin);
  const durationLabel =
    durationMinutes >= 60
      ? `${Math.floor(durationMinutes / 60)} h${durationMinutes % 60 ? ` ${durationMinutes % 60} min` : ""}`
      : `${durationMinutes} min`;

  const canSave =
    canEditBooking &&
    !busy &&
    validDate &&
    dayBookings !== null &&
    endMin > startMin &&
    overlapping === null;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const startIso = fromZonedTime(`${date}T${startTime}:00`, TIMEZONE).toISOString();
      const endIso = fromZonedTime(`${date}T${endTime}:00`, TIMEZONE).toISOString();

      const res = await fetch(booking ? `/api/bookings/${booking.id}` : "/api/bookings", {
        method: booking ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: startIso,
          end: endIso,
          note: note.trim() ? note.trim() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Salvataggio non riuscito.");
        setReload((k) => k + 1);
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  async function cancelBooking() {
    if (!booking) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? "Sblocco non riuscito.");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  // Vista sola lettura per gli slot bloccati da altri utenti (quando l'utente non è admin)
  if (!canEditBooking && booking) {
    const start = new Date(booking.start);
    const end = new Date(booking.end);
    return (
      <Modal title="Dettagli slot VDI bloccato" onClose={onClose}>
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
            <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div className="flex flex-col gap-1 text-sm">
              <p className="text-base font-semibold text-foreground">
                {booking.participantName ?? "Partecipante"}
              </p>
              <p className="flex items-center gap-1.5 text-muted-foreground first-letter:uppercase">
                <Calendar className="h-3.5 w-3.5" />
                {longDate(romeDateString(start))}
              </p>
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                <Clock className="h-3.5 w-3.5 text-accent" />
                {romeTime(start)} – {romeTime(end)}
              </p>
              {booking.note && (
                <p className="mt-1 rounded bg-background/80 px-2.5 py-1.5 text-xs italic text-muted-foreground">
                  &ldquo;{booking.note}&rdquo;
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              Chiudi
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={booking ? "Modifica blocco VDI" : "Blocca slot VDI"}
      onClose={() => !busy && onClose()}
    >
      <div className="flex flex-col gap-4">
        {/* Riepilogo stile Teams */}
        <div className="flex items-center justify-between rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-accent" />
            <span className="font-medium capitalize text-foreground">{longDate(date)}</span>
          </div>
          <div className="flex items-center gap-1.5 font-semibold text-accent">
            <Clock className="h-4 w-4" />
            <span>
              {startTime} – {endTime}
            </span>
            <span className="text-xs font-normal text-muted-foreground">({durationLabel})</span>
          </div>
        </div>

        {/* Giorno + Ora Inizio + Ora Fine (stile Microsoft Teams) */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="b-date">Giorno</Label>
            <Input
              id="b-date"
              type="date"
              value={date}
              min={minAllowedDate}
              max={BOOKING_HORIZON_END}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="b-start">Inizio</Label>
            <select
              id="b-start"
              value={startTime}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              {TIME_OPTIONS.slice(0, -1).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="b-end">Fine</Label>
            <select
              id="b-end"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              {TIME_OPTIONS.filter((t) => parseTimeMin(t) > startMin).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Scelta rapida durata (30 min, 1 ora, 1h 30m, 2 ore) */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="mr-1 text-muted-foreground">Durata rapida:</span>
          {(
            [
              [30, "30 min"],
              [60, "1 ora"],
              [90, "1h 30m"],
              [120, "2 ore"],
            ] as const
          ).map(([mins, label]) => {
            const targetEndMin = startMin + mins;
            const disabled = targetEndMin > DAY_END_HOUR * 60;
            const active = durationMinutes === mins;
            return (
              <button
                key={mins}
                type="button"
                disabled={disabled}
                onClick={() => setEndTime(fmtMinutes(targetEndMin))}
                className={`rounded-md border px-2.5 py-1 font-medium transition-colors disabled:opacity-40 ${
                  active
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Campo Note / Attività opzionale (stile titolo riunione Teams) */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="b-note">Note / Attività (opzionale)</Label>
          <Input
            id="b-note"
            placeholder="es. Sviluppo progetto AI Lab, test modello..."
            maxLength={280}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {/* Stato disponibilità in tempo reale */}
        {!validDate ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Giorno non prenotabile (weekend, festività o fuori dal periodo consentito).</span>
          </div>
        ) : overlapping ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Fascia già occupata da <strong>{overlapping.participantName}</strong> (
              {fmtMinutes(overlapping.startMin)} – {fmtMinutes(overlapping.endMin)}). Scegli un altro orario.
            </span>
          </div>
        ) : (
          dayBookings !== null && (
            <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-foreground">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              <span>
                Fascia <strong>{startTime} – {endTime}</strong> disponibile. Il tuo nome sarà visibile a tutti sul
                calendario.
              </span>
            </div>
          )
        )}

        {/* Elenco sintetico degli slot già bloccati nella giornata */}
        {dayBookings && dayBookings.length > 0 && (
          <div className="rounded-md border border-border bg-muted/30 p-2.5 text-xs">
            <p className="mb-1.5 font-medium text-muted-foreground">
              Fasce già bloccate in questa giornata:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {dayBookings.map((b) => (
                <span
                  key={b.id}
                  className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 font-medium text-foreground"
                >
                  <span className="text-accent">
                    {fmtMinutes(b.startMin)}–{fmtMinutes(b.endMin)}
                  </span>
                  <span>· {b.participantName}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <div>
            {booking &&
              (confirmCancel ? (
                <Button variant="destructive" size="sm" disabled={busy} onClick={cancelBooking}>
                  Conferma sblocco slot
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirmCancel(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> Sblocca slot
                </Button>
              ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Annulla
            </Button>
            <Button onClick={save} disabled={!canSave}>
              <Lock className="h-4 w-4" />
              {booking ? "Salva modifiche" : "Blocca slot"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
