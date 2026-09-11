/** Calendario sintético: semestres completos, sin los recesos del calendario real de la OE. */
export function calendarFor(now: Date) {
  if (!Number.isFinite(now.getTime())) throw new Error("Fecha E2E inválida");
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(now);
  const year = Number(day.slice(0, 4));
  const semester = Number(day.slice(5, 7)) <= 6 ? 1 : 2;
  const previousYear = semester === 1 ? year - 1 : year;
  const previousSemester = semester === 1 ? 2 : 1;
  return {
    day,
    current: {
      code: `${year}-${semester}`,
      semester,
      startsOn: `${year}-${semester === 1 ? "01-01" : "07-01"}`,
      endsOn: `${year}-${semester === 1 ? "06-30" : "12-31"}`,
    },
    previous: {
      code: `${previousYear}-${previousSemester}`,
      semester: previousSemester,
      startsOn: `${previousYear}-${previousSemester === 1 ? "01-01" : "07-01"}`,
      endsOn: `${previousYear}-${previousSemester === 1 ? "06-30" : "12-31"}`,
    },
  };
}

export const E2E_CALENDAR = calendarFor(new Date());
export const E2E_TERM = E2E_CALENDAR.current;

/** Fecha del escenario: mañana, o el último día del término si mañana ya queda fuera. */
export function withinTermInput(hour = 18, calendar = E2E_CALENDAR): string {
  const tomorrow = new Date(`${calendar.day}T12:00:00-05:00`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const day = tomorrow.toISOString().slice(0, 10);
  return `${day > calendar.current.endsOn ? calendar.current.endsOn : day}T${String(hour).padStart(2, "0")}:00`;
}
