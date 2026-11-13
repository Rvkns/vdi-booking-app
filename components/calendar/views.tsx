"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { isBookableDay } from "@/lib/holidays";
import { DAY_END_HOUR, DAY_START_HOUR } from "@/lib/slots";
import {
  addDays,
  dayNumber,
  fmtMinutes,
  monthName,
  periodRange,
  romeMinutes,
  startOfWeek,
  weekdayIdx,
  weekdayShort,
} from "@/lib/calendar";

const HOUR_H = 68; // px per ora (34px per ogni slot da 30 minuti)
const HALF_H = HOUR_H / 2;
const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export type CalEvent = {
  id: string;
  dateStr: string;
  startMin: number;
  endMin: number;
  title: string;
  subtitle?: string;
  organizer?: string;
  initials?: string;
  note?: string | null;
  tone: "mine" | "taken" | "lesson";
  onClick?: () => void;
};

const TONE: Record<CalEvent["tone"], string> = {
  mine: "border-border border-l-4 border-l-accent bg-card text-foreground shadow-[inset_0_0_0_999px_hsl(var(--accent)/0.14)]",
  taken:
    "border-border border-l-4 border-l-foreground/60 bg-card text-foreground shadow-[inset_0_0_0_999px_hsl(var(--muted)/0.85)]",
  lesson:
    "border-success/50 border-l-4 border-l-success bg-card text-foreground shadow-[inset_0_0_0_999px_hsl(var(--success)/0.15)]",
};

/** Dispone gli eventi sovrapposti in corsie affiancate. */
function layoutLanes(events: CalEvent[]): { ev: CalEvent; lane: number; lanes: number }[] {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const out: { ev: CalEvent; lane: number; lanes: number }[] = [];
  let cluster: typeof out = [];
  let clusterEnd = -1;
  const laneEnds: number[] = [];

  const flush = () => {
    const lanes = laneEnds.length;
    cluster.forEach((c) => (c.lanes = lanes));
    out.push(...cluster);
    cluster = [];
    laneEnds.length = 0;
  };

  for (const ev of sorted) {
    if (ev.startMin >= clusterEnd && cluster.length) flush();
    let lane = laneEnds.findIndex((end) => end <= ev.startMin);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = ev.endMin;
    cluster.push({ ev, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, ev.endMin);
  }
  if (cluster.length) flush();
  return out;
}

// ---------------------------------------------------------------------------
// Settimana lavorativa (lun-ven, 09:00-18:00) in stile Microsoft Teams Calendar
// Griglia a passi di 30 minuti: click singolo = 30 min, trascinamento = multipli di 30 min
// ---------------------------------------------------------------------------
export function WeekView({
  anchor,
  today,
  minDate,
  maxDate,
  events,
  cellDisabled,
  slotDisabled,
  onCellClick,
  onSlotRangeSelect,
}: {
  anchor: string;
  today: string;
  minDate: string;
  maxDate: string;
  events: CalEvent[];
  cellDisabled: (dateStr: string, hour: number) => boolean;
  slotDisabled?: (dateStr: string, startMin: number) => boolean;
  onCellClick: (dateStr: string, hour: number) => void;
  onSlotRangeSelect?: (dateStr: string, startMin: number, endMin: number) => void;
}) {
  const monday = startOfWeek(anchor);
  const days = Array.from({ length: 5 }, (_, i) => addDays(monday, i));
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);
  // Slot da 30 minuti: 09:00 (540), 09:30 (570), ..., 17:30 (1050)
  const halfSlots = Array.from(
    { length: (DAY_END_HOUR - DAY_START_HOUR) * 2 },
    (_, i) => DAY_START_HOUR * 60 + i * 30
  );

  // Stato per selezione tramite click o drag a passi di 30 minuti (stile Teams)
  const [drag, setDrag] = React.useState<{
    day: string;
    anchorMin: number;
    currentMin: number;
  } | null>(null);

  React.useEffect(() => {
    if (!drag) return;
    const handleUp = () => {
      const startMin = Math.min(drag.anchorMin, drag.currentMin);
      const endMin = Math.max(drag.anchorMin, drag.currentMin) + 30;
      const d = drag.day;
      setDrag(null);
      if (onSlotRangeSelect) {
        onSlotRangeSelect(d, startMin, endMin);
      } else {
        onCellClick(d, Math.floor(startMin / 60));
      }
    };
    window.addEventListener("mouseup", handleUp);
    return () => window.removeEventListener("mouseup", handleUp);
  }, [drag, onCellClick, onSlotRangeSelect]);

  // Linea dell'orario corrente (stile Microsoft Teams)
  const nowMin = romeMinutes(new Date());
  const showNowLine = nowMin >= DAY_START_HOUR * 60 && nowMin <= DAY_END_HOUR * 60;
  const nowTop = ((nowMin - DAY_START_HOUR * 60) / 60) * HOUR_H;

  // Su schermi stretti la griglia scorre in orizzontale: porta in vista il giorno corrente.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const box = scrollRef.current;
    const col = box?.querySelector<HTMLElement>(`[data-day="${today}"]`);
    if (box) box.scrollLeft = col ? Math.max(0, col.offsetLeft - 56) : 0;
  }, [anchor, today]);

  return (
    <div
      ref={scrollRef}
      className="select-none overflow-x-auto rounded-lg border border-border bg-card shadow-sm"
    >
      <div className="grid min-w-[640px] grid-cols-[60px_repeat(5,minmax(0,1fr))]">
        {/* Angolo in alto a sinistra */}
        <div className="sticky left-0 z-10 flex items-end justify-end border-b border-border bg-muted/30 pb-1.5 pr-2 text-[10px] font-medium text-muted-foreground">
          GMT+1
        </div>

        {/* Intestazioni dei giorni (stile Microsoft Teams: numero grande + nome giorno) */}
        {days.map((d) => {
          const isToday = d === today;
          const holiday = weekdayIdx(d) < 5 && !isBookableDay(d);
          const off = !isBookableDay(d) || d < minDate || d > maxDate;
          return (
            <div
              key={d}
              data-day={d}
              className={cn(
                "relative border-b border-l border-border px-3 py-2.5 transition-colors",
                isToday ? "border-t-4 border-t-accent bg-accent/5" : "bg-muted/20",
                off && "opacity-60"
              )}
            >
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "text-xl font-bold leading-none",
                    isToday ? "text-accent" : "text-foreground"
                  )}
                >
                  {dayNumber(d)}
                </span>
                <span
                  className={cn(
                    "text-xs font-medium capitalize",
                    isToday ? "font-semibold text-accent" : "text-muted-foreground"
                  )}
                >
                  {weekdayShort(d)}
                </span>
                {holiday && (
                  <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Festivo
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Colonna orari a sinistra */}
        <div className="sticky left-0 z-10 bg-card">
          {hours.map((h) => (
            <div
              key={h}
              style={{ height: HOUR_H }}
              className="flex flex-col justify-between border-b border-border/70 pr-2 py-1 text-right text-xs font-medium text-muted-foreground"
            >
              <span>{String(h).padStart(2, "0")}:00</span>
              <span className="text-[10px] text-muted-foreground/60">{String(h).padStart(2, "0")}:30</span>
            </div>
          ))}
        </div>

        {/* Colonne dei 5 giorni lavorativi */}
        {days.map((d) => {
          const dayOff = !isBookableDay(d) || d < minDate || d > maxDate;
          const lanes = layoutLanes(events.filter((e) => e.dateStr === d));
          const isDraggingThisDay = drag?.day === d;
          const dragStartMin = isDraggingThisDay ? Math.min(drag.anchorMin, drag.currentMin) : -1;
          const dragEndMin = isDraggingThisDay ? Math.max(drag.anchorMin, drag.currentMin) + 30 : -1;

          return (
            <div
              key={d}
              className={cn("relative border-l border-border", dayOff && "bg-muted/25")}
              style={{ height: HOUR_H * hours.length }}
            >
              {/* Celle a passi di 30 minuti cliccabili e trascinabili */}
              {halfSlots.map((slotMin) => {
                const isHalfHour = slotMin % 60 === 30;
                const disabled =
                  dayOff ||
                  (slotDisabled
                    ? slotDisabled(d, slotMin)
                    : cellDisabled(d, Math.floor(slotMin / 60)));
                const label = `${fmtMinutes(slotMin)} – ${fmtMinutes(slotMin + 30)}`;
                const inDrag = isDraggingThisDay && slotMin >= dragStartMin && slotMin < dragEndMin;

                return (
                  <div
                    key={slotMin}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-label={`${d} ${fmtMinutes(slotMin)}`}
                    style={{ height: HALF_H }}
                    onMouseDown={(e) => {
                      if (disabled || e.button !== 0) return;
                      e.preventDefault();
                      setDrag({ day: d, anchorMin: slotMin, currentMin: slotMin });
                    }}
                    onMouseEnter={() => {
                      if (drag && drag.day === d && !disabled) {
                        setDrag((prev) => (prev ? { ...prev, currentMin: slotMin } : null));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (!disabled && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        if (onSlotRangeSelect) onSlotRangeSelect(d, slotMin, slotMin + 30);
                        else onCellClick(d, Math.floor(slotMin / 60));
                      }
                    }}
                    className={cn(
                      "group relative flex w-full items-center px-2 transition-colors",
                      isHalfHour
                        ? "border-b border-border/80"
                        : "border-b border-dashed border-border/45",
                      disabled
                        ? "cursor-not-allowed bg-muted/35"
                        : "cursor-pointer hover:bg-accent/10",
                      inDrag && "bg-accent/20"
                    )}
                  >
                    {!disabled && !inDrag && (
                      <span className="pointer-events-none inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                        + Blocca {label}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Anteprima trascinamento (drag selection stile Teams) */}
              {isDraggingThisDay && (
                <div
                  className="pointer-events-none absolute left-1 right-1 z-20 flex items-center rounded-md border-2 border-accent bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent shadow-md"
                  style={{
                    top: ((dragStartMin - DAY_START_HOUR * 60) / 60) * HOUR_H + 1,
                    height: ((dragEndMin - dragStartMin) / 60) * HOUR_H - 2,
                  }}
                >
                  Nuovo blocco · {fmtMinutes(dragStartMin)} – {fmtMinutes(dragEndMin)}
                </div>
              )}

              {/* Linea rossa dell'ora attuale (stile Teams) */}
              {d === today && showNowLine && (
                <div
                  className="pointer-events-none absolute left-0 right-0 z-20 flex items-center"
                  style={{ top: nowTop }}
                >
                  <span className="-ml-1.5 h-3 w-3 rounded-full bg-accent ring-2 ring-card" />
                  <span className="h-[2px] w-full bg-accent" />
                </div>
              )}

              {/* Blocchi prenotati / lezioni (stile card Microsoft Teams, ottimizzato anche per 30 min) */}
              {lanes.map(({ ev, lane, lanes: n }) => {
                const top = ((ev.startMin - DAY_START_HOUR * 60) / 60) * HOUR_H;
                const height = ((ev.endMin - ev.startMin) / 60) * HOUR_H;
                const compact = height < 46;
                const Tag = ev.onClick ? "button" : "div";
                return (
                  <Tag
                    key={ev.id}
                    type={ev.onClick ? "button" : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      ev.onClick?.();
                    }}
                    title={`${ev.title}${ev.subtitle ? " · " + ev.subtitle : ""}${ev.note ? " · " + ev.note : ""}`}
                    style={{
                      top: top + 1,
                      height: Math.max(height - 2, 26),
                      left: `calc(${(lane / n) * 100}% + 2px)`,
                      width: `calc(${100 / n}% - 4px)`,
                    }}
                    className={cn(
                      "absolute z-10 overflow-hidden rounded-md border px-2 text-left text-xs leading-tight shadow-sm transition-all",
                      compact ? "flex items-center py-0.5" : "flex flex-col justify-between py-1.5",
                      TONE[ev.tone],
                      ev.onClick && "cursor-pointer hover:shadow-md hover:ring-1 hover:ring-accent"
                    )}
                  >
                    <div
                      className={cn(
                        "flex w-full gap-1.5 overflow-hidden",
                        compact ? "items-center" : "items-start"
                      )}
                    >
                      {ev.initials && (
                        <span
                          className={cn(
                            "flex shrink-0 items-center justify-center rounded-full font-bold",
                            compact ? "h-4 w-4 text-[9px]" : "mt-0.5 h-5 w-5 text-[10px]",
                            ev.tone === "mine"
                              ? "bg-accent text-accent-foreground"
                              : "bg-foreground/15 text-foreground"
                          )}
                        >
                          {ev.initials}
                        </span>
                      )}
                      {compact ? (
                        <div className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                          <span className="truncate font-semibold">{ev.title}</span>
                          {ev.subtitle && (
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {ev.subtitle}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold">{ev.title}</div>
                          {ev.subtitle && (
                            <div className="truncate text-[11px] text-muted-foreground">{ev.subtitle}</div>
                          )}
                          {ev.note && height >= 60 && (
                            <div className="mt-0.5 truncate text-[11px] italic text-muted-foreground">
                              {ev.note}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </Tag>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mese
// ---------------------------------------------------------------------------
export function MonthView({
  anchor,
  today,
  minDate,
  maxDate,
  renderDay,
  onDayClick,
}: {
  anchor: string;
  today: string;
  minDate: string;
  maxDate: string;
  renderDay: (dateStr: string) => React.ReactNode;
  onDayClick: (dateStr: string) => void;
}) {
  const { from } = periodRange("month", anchor);
  const days = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  const month = anchor.slice(0, 7);

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <div className="grid min-w-[560px] grid-cols-7">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="border-b border-border px-2 py-1.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {w}
          </div>
        ))}
        {days.map((d, i) => {
          const weekend = weekdayIdx(d) >= 5;
          const inMonth = d.startsWith(month);
          const off = !isBookableDay(d) || d < minDate || d > maxDate;
          return (
            <button
              key={d}
              type="button"
              disabled={off}
              onClick={() => onDayClick(d)}
              className={cn(
                "flex min-h-[92px] flex-col items-stretch gap-1 border-border p-1.5 text-left transition-colors",
                i >= 7 && "border-t",
                i % 7 !== 0 && "border-l",
                off ? "cursor-default bg-muted/30" : "cursor-pointer hover:bg-accent/5",
                !inMonth && "opacity-45"
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center self-start rounded-full text-xs font-semibold",
                  d === today && "bg-accent text-accent-foreground",
                  weekend && d !== today && "text-muted-foreground"
                )}
              >
                {dayNumber(d)}
              </span>
              {!off && renderDay(d)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anno
// ---------------------------------------------------------------------------
export type YearTone = "none" | "partial" | "full" | "mine" | "lesson";

const YEAR_TONE: Record<YearTone, string> = {
  none: "",
  partial: "bg-muted-foreground/20",
  full: "bg-foreground/60 text-background",
  mine: "bg-accent text-accent-foreground",
  lesson: "bg-success text-success-foreground",
};

export function YearView({
  anchor,
  today,
  minDate,
  maxDate,
  dayTone,
  onDayClick,
  onMonthClick,
}: {
  anchor: string;
  today: string;
  minDate: string;
  maxDate: string;
  dayTone: (dateStr: string) => YearTone;
  onDayClick: (dateStr: string) => void;
  onMonthClick: (monthStart: string) => void;
}) {
  const year = anchor.slice(0, 4);
  const months = Array.from({ length: 12 }, (_, m) => `${year}-${String(m + 1).padStart(2, "0")}-01`);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {months.map((ms) => {
        const lead = weekdayIdx(ms);
        const daysInMonth = daysIn(ms);
        const cells: (string | null)[] = [
          ...Array(lead).fill(null),
          ...Array.from({ length: daysInMonth }, (_, i) => addDays(ms, i)),
        ];
        const monthOff = addDays(ms, daysInMonth - 1) < minDate || ms > maxDate;
        return (
          <div key={ms} className={cn("rounded-lg border border-border bg-card p-3", monthOff && "opacity-50")}>
            <button
              type="button"
              disabled={monthOff}
              onClick={() => onMonthClick(ms)}
              className="mb-2 text-sm font-semibold capitalize hover:text-accent disabled:hover:text-inherit"
            >
              {monthName(ms)}
            </button>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
              {WEEKDAYS.map((w) => (
                <div key={w} className="text-muted-foreground">
                  {w[0]}
                </div>
              ))}
              {cells.map((d, i) => {
                if (!d) return <div key={`b${i}`} />;
                const off = !isBookableDay(d) || d < minDate || d > maxDate;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={off}
                    onClick={() => onDayClick(d)}
                    title={d}
                    className={cn(
                      "flex h-7 items-center justify-center rounded-sm transition-colors",
                      off
                        ? "cursor-default text-muted-foreground/60"
                        : cn("hover:ring-1 hover:ring-accent", YEAR_TONE[dayTone(d)]),
                      d === today && "ring-2 ring-foreground/70"
                    )}
                  >
                    {dayNumber(d)}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function daysIn(monthStart: string): number {
  const [y, m] = monthStart.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
