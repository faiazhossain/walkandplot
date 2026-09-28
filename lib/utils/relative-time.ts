// Plain-language relative times for project cards (PRD 9: "Edited 2 hours ago").
// Deterministic on a passed `now` so it is unit-testable in Node.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp;
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) {
    const m = Math.floor(diff / MINUTE);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (diff < 7 * DAY) {
    const d = Math.floor(diff / DAY);
    return d === 1 ? "yesterday" : `${d} days ago`;
  }
  if (diff < 14 * DAY) return "last week";
  if (diff < 30 * DAY) {
    const w = Math.floor(diff / (7 * DAY));
    return `${w} weeks ago`;
  }
  return "over a month ago";
}
