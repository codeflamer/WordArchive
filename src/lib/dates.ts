export const savedOn = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

// The reader's own calendar date, as 2026-11-05. An ISO date would give the UTC day, which changes at the wrong hour.
export function localDay(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
