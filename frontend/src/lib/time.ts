// Time zone and time display helpers (IANA names in, current offsets out).

/** Return the browser's IANA time zone, or UTC if the browser does not report one. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Return every IANA zone the browser knows, with UTC first. */
export function allTimeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  const zones = intl.supportedValuesOf ? intl.supportedValuesOf('timeZone') : [browserTimeZone()];
  return ['UTC', ...zones.filter((zone) => zone !== 'UTC')];
}

/** Return the current UTC offset of a zone as "UTC+05:30", or null for an unknown zone. */
export function zoneOffset(timezone: string, at: Date = new Date()): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' }).formatToParts(at);
    const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
    return name === 'GMT' ? 'UTC+00:00' : name.replace('GMT', 'UTC');
  } catch {
    return null;
  }
}

/** Return `Asia/Kolkata (UTC+05:30)` using the current offset. */
export function formatZone(timezone: string, at: Date = new Date()): string {
  const offset = zoneOffset(timezone, at);
  return offset ? `${timezone.replace(/_/g, ' ')} (${offset})` : timezone;
}

/** Return a short relative time such as "just now", "5 min ago", "3 h ago" or a date. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Return how long until an instant, such as "47 h" or "12 min". */
export function timeUntil(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.round((new Date(iso).getTime() - now.getTime()) / 60000));
  return minutes >= 120 ? `${Math.round(minutes / 60)} h` : `${minutes} min`;
}
