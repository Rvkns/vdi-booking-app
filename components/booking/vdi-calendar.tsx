"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { BookingDialog, type EditingBooking } from "@/components/booking/booking-dialog";
import { CalendarToolbar } from "@/components/calendar/toolbar";
import { MonthView, WeekView, YearView, type CalEvent, type YearTone } from "@/components/calendar/views";
import { isBookableDay } from "@/lib/holidays";
import { BOOKING_HORIZON_END, DAY_END_HOUR, DAY_START_HOUR, generateDaySlots, romeDateString } from "@/lib/slots";
import {
  addDays,
  clampStr,
  fmtMinutes,
  longDate,
  periodRange,
  romeMinutes,
  romeTime,
  startOfWeek,
  todayRome,
  type CalView,
} from "@/lib/calendar";
import { cn } from "@/lib/utils";

type Booking = {
  id: number;
  start: string;
  end: string;
  mine: boolean;
  participantName: string;
  username?: string;
  note?: string | null;
};
type Lesson = {
  id: number;
  start: string;
  end: string;
  title: string;
  level: number;
  participants: number;
  mine: boolean;
};
type Mine = { id: number; start: string; end: string; note?: string | null };
type Editor = {
  booking: EditingBooking;
  date: string;
  startTime?: string;
  endTime?: string;
};

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function VdiCalendar({ isAdmin = false }: { isAdmin?: boolean }) {
  const today = todayRome();
  const minDate = startOfWeek(today);
  const [view, setView] = React.useState<CalView>("week");
  const [anchor, setAnchor] = React.useState(today);
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [lessons, setLessons] = React.useState<Lesson[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [editor, setEditor] = React.useState<Editor | null>(null);
  const [mine, setMine] = React.useState<Mine[]>([]);

  const range = React.useMemo(() => periodRange(view, anchor), [view, anchor]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch(`/api/bookings/range?from=${range.from}&to=${range.to}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Impossibile caricare le prenotazioni.");
        if (!cancelled) {
          setBookings(data.bookings);
          setLessons(data.lessons ?? []);
        }
      })
      .catch((e) => !cancelled && setLoadError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, reloadKey]);

  React.useEffect(() => {
    fetch("/api/bookings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setMine(d.bookings))
      .catch(() => {});
  }, [reloadKey]);

  const byDay = React.useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of bookings) {
      const k = romeDateString(new Date(b.start));
      m.set(k, [...(m.get(k) ?? []), b]);
    }
    return m;
  }, [bookings]);

  const lessonsByDay = React.useMemo(() => {
    const m = new Map<string, Lesson[]>();
    for (const l of lessons) {
      const k = romeDateString(new Date(l.start));
      m.set(k, [...(m.get(k) ?? []), l]);
    }
    return m;
  }, [lessons]);

  /**
   * Verifica se lo slot da 30 minuti [startMin, startMin + 30) del giorno d è
   * già occupato: da una prenotazione oppure da una sessione di formazione
   * (le lezioni bloccano la VDI per tutti).
   */
  function isSlotBooked(d: string, startMin: number): boolean {
    const endMin = startMin + 30;
    const overlaps = (from: string, to: string) => {
      const sMin = romeMinutes(new Date(from));
      const eMin = romeMinutes(new Date(to)) || DAY_END_HOUR * 60;
      return startMin < eMin && endMin > sMin;
    };
    if ((byDay.get(d) ?? []).some((b) => overlaps(b.start, b.end))) return true;
    return (lessonsByDay.get(d) ?? []).some((l) => overlaps(l.start, l.end));
  }

  /** Riepilogo giornaliero per le viste Mese e Anno. */
  function daySummary(d: string) {
    const totalHalfSlots = isBookableDay(d) ? (DAY_END_HOUR - DAY_START_HOUR) * 2 : 0;
    const dayBookings = byDay.get(d) ?? [];
    let bookedHalfSlots = 0;
    for (let m = DAY_START_HOUR * 60; m < DAY_END_HOUR * 60; m += 30) {
      if (isSlotBooked(d, m)) bookedHalfSlots += 1;
    }
    const freeHalfSlots = Math.max(0, totalHalfSlots - bookedHalfSlots);
    const dayLessons = lessonsByDay.get(d) ?? [];
    const mineCount = dayBookings.filter((b) => b.mine).length + dayLessons.filter((l) => l.mine).length;
    return {
      total: totalHalfSlots,
      free: freeHalfSlots,
      mine: mineCount,
      taken: dayBookings.length + dayLessons.length,
      dayBookings,
      dayLessons,
    };
  }

  const events: CalEvent[] = bookings.map((b) => {
    const start = new Date(b.start);
    const end = new Date(b.end);
    const displayName = b.participantName || "Utente";
    const canEdit = b.mine || isAdmin;
    return {
      id: `b${b.id}`,
      dateStr: romeDateString(start),
      startMin: romeMinutes(start),
      endMin: romeMinutes(end) || 24 * 60,
      title: b.mine ? `${displayName} (Tu)` : displayName,
      subtitle: `${romeTime(start)} – ${romeTime(end)}`,
      initials: getInitials(displayName),
      note: b.note,
      tone: b.mine ? "mine" : "taken",
      onClick: () =>
        setEditor({
          booking: {
            id: b.id,
            start: b.start,
            end: b.end,
            mine: b.mine,
            canEdit,
            participantName: displayName,
            note: b.note,
          },
          date: romeDateString(start),
        }),
    };
  });

  const lessonEvents: CalEvent[] = lessons.map((l) => {
    const start = new Date(l.start);
    const end = new Date(l.end);
    return {
      id: `l${l.id}`,
      dateStr: romeDateString(start),
      startMin: romeMinutes(start),
      endMin: romeMinutes(end) || 24 * 60,
      title: `Formazione · ${l.title}`,
      subtitle: `${romeTime(start)} – ${romeTime(end)} · Livello ${l.level}`,
      organizer: l.mine ? "Sei tra i partecipanti" : undefined,
      note: l.mine
        ? "Sessione di formazione a cui partecipi: la VDI non è prenotabile in questo orario."
        : "Sessione di formazione: la VDI non è prenotabile in questo orario.",
      tone: "lesson",
    };
  });

  const allEvents: CalEvent[] = [...events, ...lessonEvents];

  function cellDisabled(d: string, hour: number) {
    if (!isBookableDay(d) || d < minDate || d > BOOKING_HORIZON_END) return true;
    return isSlotBooked(d, hour * 60) && isSlotBooked(d, hour * 60 + 30);
  }

  function slotDisabled(d: string, startMin: number) {
    if (!isBookableDay(d) || d < minDate || d > BOOKING_HORIZON_END) return true;
    return isSlotBooked(d, startMin);
  }

  function onCellClick(d: string, hour: number) {
    const startTime = `${String(hour).padStart(2, "0")}:00`;
    const endTime = `${String(hour).padStart(2, "0")}:30`;
    setEditor({ booking: null, date: d, startTime, endTime });
  }

  function onSlotRangeSelect(d: string, startMin: number, endMin: number) {
    // Se nel range trascinato c'è uno slot da 30m già occupato, fermati prima dello slot occupato
    let validEndMin = startMin + 30;
    for (let m = startMin; m < endMin; m += 30) {
      if (isSlotBooked(d, m)) break;
      validEndMin = m + 30;
    }
    const startTime = fmtMinutes(startMin);
    const endTime = fmtMinutes(Math.min(DAY_END_HOUR * 60, validEndMin));
    setEditor({ booking: null, date: d, startTime, endTime });
  }

  function newBookingForDay(d: string) {
    if (!isBookableDay(d)) return;
    let firstFreeMin = DAY_START_HOUR * 60;
    for (let m = DAY_START_HOUR * 60; m < DAY_END_HOUR * 60; m += 30) {
      if (!isSlotBooked(d, m)) {
        firstFreeMin = m;
        break;
      }
    }
    const endMin = !isSlotBooked(d, firstFreeMin + 30)
      ? Math.min(DAY_END_HOUR * 60, firstFreeMin + 60)
      : Math.min(DAY_END_HOUR * 60, firstFreeMin + 30);
    setEditor({
      booking: null,
      date: d,
      startTime: fmtMinutes(firstFreeMin),
      endTime: fmtMinutes(endMin),
    });
  }

  function newBooking() {
    let d = clampStr(anchor, today, BOOKING_HORIZON_END);
    for (let i = 0; i < 10 && !isBookableDay(d); i++) d = addDays(d, 1);
    newBookingForDay(d);
  }

  const goWeek = (d: string) => {
    setView("week");
    setAnchor(d);
  };

  return (
    <div className="flex flex-col gap-3">
      <CalendarToolbar
        view={view}
        anchor={anchor}
        today={today}
        minDate={minDate}
        maxDate={BOOKING_HORIZON_END}
        loading={loading}
        onChange={(v, a) => {
          setView(v);
          setAnchor(clampStr(a, minDate, BOOKING_HORIZON_END));
        }}
        right={
          <Button size="sm" onClick={newBooking}>
            <Plus className="h-4 w-4" /> Blocca slot
          </Button>
        }
      />

      {loadError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {view === "week" && (
        <WeekView
          anchor={anchor}
          today={today}
          minDate={minDate}
          maxDate={BOOKING_HORIZON_END}
          events={allEvents}
          cellDisabled={cellDisabled}
          slotDisabled={slotDisabled}
          onCellClick={onCellClick}
          onSlotRangeSelect={onSlotRangeSelect}
        />
      )}

      {view === "month" && (
        <MonthView
          anchor={anchor}
          today={today}
          minDate={minDate}
          maxDate={BOOKING_HORIZON_END}
          onDayClick={newBookingForDay}
          renderDay={(d) => {
            const s = daySummary(d);
            if (s.total === 0) return null;
            return (
              <div className="flex flex-col gap-0.5 text-[11px] leading-tight">
                {s.dayLessons.map((l) => (
                  <span
                    key={`l${l.id}`}
                    className="truncate rounded border-l-2 border-l-success bg-success/15 px-1 py-0.5 font-medium text-success"
                    title={`${romeTime(new Date(l.start))}–${romeTime(new Date(l.end))} · Formazione: ${l.title}`}
                  >
                    {romeTime(new Date(l.start))} Formazione
                  </span>
                ))}
                {s.dayBookings.slice(0, 3).map((b) => (
                  <span
                    key={b.id}
                    className={cn(
                      "truncate rounded border-l-2 px-1 py-0.5 font-medium",
                      b.mine
                        ? "border-l-accent bg-accent/15 text-accent"
                        : "border-l-foreground/60 bg-muted text-foreground"
                    )}
                    title={`${romeTime(new Date(b.start))}–${romeTime(new Date(b.end))} · ${b.participantName}`}
                  >
                    {romeTime(new Date(b.start))} {b.participantName}
                  </span>
                ))}
                {s.dayBookings.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{s.dayBookings.length - 3} altri</span>
                )}
                {s.free > 0 ? (
                  <span className="text-muted-foreground">{s.free} ore libere</span>
                ) : (
                  s.taken > 0 && <span className="text-muted-foreground">Completo</span>
                )}
              </div>
            );
          }}
        />
      )}

      {view === "year" && (
        <YearView
          anchor={anchor}
          today={today}
          minDate={minDate}
          maxDate={BOOKING_HORIZON_END}
          onDayClick={goWeek}
          onMonthClick={(m) => {
            setView("month");
            setAnchor(clampStr(m, minDate, BOOKING_HORIZON_END));
          }}
          dayTone={(d): YearTone => {
            const s = daySummary(d);
            if (s.total === 0) return "none";
            if (s.mine > 0) return "mine";
            if (s.free === 0 && s.taken > 0) return "full";
            if (s.taken > 0) return "partial";
            return "none";
          }}
        />
      )}

      <Legend view={view} />

      {editor && (
        <BookingDialog
          booking={editor.booking}
          initialDate={editor.date}
          initialStartTime={editor.startTime}
          initialEndTime={editor.endTime}
          onClose={() => setEditor(null)}
          onDone={() => {
            setEditor(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      <MyBookings
        items={mine}
        onEdit={(b) =>
          setEditor({
            booking: { ...b, mine: true, canEdit: true },
            date: romeDateString(new Date(b.start)),
          })
        }
      />
    </div>
  );
}

function Legend({ view }: { view: CalView }) {
  const items =
    view === "year"
      ? [
          ["bg-accent", "Hai uno slot bloccato"],
          ["bg-muted-foreground/20", "Alcuni slot bloccati"],
          ["bg-foreground/60", "Giornata completa"],
        ]
      : [
          ["bg-accent/15 border-l-4 border-accent", "Tuo slot bloccato"],
          ["bg-muted border-l-4 border-foreground/60", "Bloccato da altro utente"],
          ["bg-card border border-border", "Libero (clicca o trascina sulle celle per bloccare)"],
        ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map(([cls, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded-sm ${cls}`} /> {label}
        </span>
      ))}
      <span>Clicca su una cella (o trascina su più ore) come su Microsoft Teams per bloccare uno slot</span>
    </div>
  );
}

function MyBookings({ items, onEdit }: { items: Mine[]; onEdit: (b: Mine) => void }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-2 rounded-lg border border-border bg-card p-3">
      <h3 className="mb-2 text-sm font-semibold">I tuoi slot bloccati ({items.length})</h3>
      <ul className="flex flex-col divide-y divide-border">
        {items.map((b) => {
          const start = new Date(b.start);
          return (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                <span className="first-letter:uppercase">{longDate(romeDateString(start))}</span> · {romeTime(start)}–
                {romeTime(new Date(b.end))}
                {b.note && <span className="ml-2 italic text-muted-foreground">({b.note})</span>}
              </span>
              <Button size="sm" variant="outline" onClick={() => onEdit(b)}>
                Modifica o sblocca
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
