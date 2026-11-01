const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Local calendar date as yyyy-mm-dd, so a day never shifts by timezone. */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dateFromIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function shiftIsoDate(iso: string, days: number): string {
  const date = dateFromIso(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** "Today", "Yesterday", or "Mon 30 Oct" for anything older. */
export function dayLabel(iso: string, todayIso: string): string {
  if (iso === todayIso) return "Today";
  if (iso === shiftIsoDate(todayIso, -1)) return "Yesterday";

  const date = dateFromIso(iso);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}
