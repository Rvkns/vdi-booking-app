import { isBookableDay } from "./holidays";
import { BOOKING_HORIZON_END, DAY_END_HOUR, DAY_START_HOUR, romeDateString } from "./slots";
import { romeMinutes, startOfWeek, todayRome } from "./calendar";

export type SlotCheck = { ok: true; start: Date; end: Date } | { ok: false; error: string };

/**
 * Regole di business per uno slot VDI richiesto dal client (prenotazione o
 * spostamento): giorno lavorativo (lun-ven, festivi esclusi), orario compreso
 * tra le 09:00 e le 18:00 (passi da 30 o 60 minuti), entro l'orizzonte.
 */
export function validateBookingSlot(start: string, end: string): SlotCheck {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { ok: false, error: "Richiesta non valida." };
  }
  if (endDate.getTime() <= startDate.getTime()) {
    return { ok: false, error: "L'orario di fine deve essere successivo all'orario di inizio." };
  }

  const day = romeDateString(startDate);
  const endDay = romeDateString(endDate);
  if (day !== endDay) {
    return { ok: false, error: "La prenotazione deve iniziare e terminare nella stessa giornata." };
  }

  const minAllowedDay = startOfWeek(todayRome());
  if (day < minAllowedDay) {
    return { ok: false, error: "Non è possibile prenotare in settimane passate." };
  }
  if (day > BOOKING_HORIZON_END) {
    return { ok: false, error: "Le prenotazioni sono aperte fino al 31/03/2030." };
  }
  if (!isBookableDay(day)) {
    return {
      ok: false,
      error: "Giorno non prenotabile (weekend o festività nazionale).",
    };
  }

  const startMin = romeMinutes(startDate);
  const endMin = romeMinutes(endDate);
  if (
    startMin < DAY_START_HOUR * 60 ||
    endMin > DAY_END_HOUR * 60 ||
    startMin % 15 !== 0 ||
    endMin % 15 !== 0
  ) {
    return {
      ok: false,
      error: `Lo slot deve rientrare negli orari ${String(DAY_START_HOUR).padStart(2, "0")}:00–${String(DAY_END_HOUR).padStart(2, "0")}:00.`,
    };
  }

  return { ok: true, start: startDate, end: endDate };
}
