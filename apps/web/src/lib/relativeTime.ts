/** Human-readable elapsed time like "3 min ago" - used in the restore-snapshot banner text. */
export function minutesAgoLabel(savedAt: number, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - savedAt) / 60000));
  if (minutes === 0) {
    return "just now";
  }
  return `${minutes} min ago`;
}
