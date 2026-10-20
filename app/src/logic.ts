// Pure helpers (no React Native imports) so they can be unit-tested with plain Node.

/** Validates a Sendbird user id: non-empty, no whitespace, at most 80 chars. */
export function validateUserId(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Enter a user id';
  if (/\s/.test(v)) return 'No spaces allowed';
  if (v.length > 80) return 'At most 80 characters';
  return null;
}

/** "81234567890" -> "812 3456 7890" */
export function formatMeetingNumber(n: string): string {
  const d = n.replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
  if (d.length === 10 || d.length === 9) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return d;
}

/** Zoom meeting numbers are 9 to 11 digits. */
export const isValidMeetingNumber = (n: string): boolean => /^\d{9,11}$/.test(n.replace(/\s/g, ''));

/** "192.168.1.20:8000/" -> "http://192.168.1.20:8000" */
export function normalizeBaseUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/+$/, '');
}

/** Newest first, no duplicates, at most 5. */
export function addRecent(list: string[], meetingNumber: string): string[] {
  return [meetingNumber, ...list.filter((m) => m !== meetingNumber)].slice(0, 5);
}

/** Turns a failed token request into advice a person can act on. */
export function friendlyTokenError(e: unknown, serverUrl: string): string {
  const text = e instanceof Error ? e.message : String(e);
  if (/Network request failed|Failed to fetch|timeout/i.test(text)) {
    return `Cannot reach the server at ${serverUrl}.\n\nCheck that the backend is running, the phone is on the same Wi-Fi as the PC, and the address is the PC's LAN IP (not localhost).`;
  }
  if (/\(5\d\d\)/.test(text)) return `The server is misconfigured (is ZOOM_SDK_KEY / ZOOM_SDK_SECRET set?).\n${text}`;
  return text;
}

// ---- scheduled meetings & announcements ----

const pad = (n: number) => String(n).padStart(2, '0');
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-03-05" + "14:30" (the phone's local time) -> Date, or null if it is not a real date and time. */
export function parseLocalDateTime(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!d || !t) return null;
  const [y, mo, da, h, mi] = [+d[1], +d[2], +d[3], +t[1], +t[2]];
  const out = new Date(y, mo - 1, da, h, mi, 0, 0);
  const real = out.getFullYear() === y && out.getMonth() === mo - 1 && out.getDate() === da && h < 24 && mi < 60;
  return real ? out : null;
}

export const toDateInput = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toTimeInput = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Today, 14:30", "Tomorrow, 09:00", "Mon 5 Mar, 09:00". */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(d, now)) return `Today, ${time}`;
  if (sameDay(d, tomorrow)) return `Tomorrow, ${time}`;
  if (sameDay(d, yesterday)) return `Yesterday, ${time}`;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${time}`;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", then a date. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const min = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 60 * 24) return `${Math.floor(min / 60)} h ago`;
  if (min < 60 * 24 * 7) return `${Math.floor(min / 60 / 24)} d ago`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export type MeetingTiming = 'live' | 'soon' | 'upcoming' | 'past';

/** live = may be running now (joining opens 10 min early), soon = within the next hour. */
export function meetingTiming(startIso: string, durationMinutes: number, now: Date = new Date()): MeetingTiming {
  const start = new Date(startIso).getTime();
  const t = now.getTime();
  if (Number.isNaN(start)) return 'upcoming';
  if (t >= start - 10 * 60000 && t <= start + durationMinutes * 60000) return 'live';
  if (t > start + durationMinutes * 60000) return 'past';
  return start - t <= 60 * 60000 ? 'soon' : 'upcoming';
}

/** "alice, bob  carol" -> ["alice","bob","carol"] (no duplicates, no blanks). */
export function parseIds(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];
}

export function validateAnnouncement(title: string, body: string): string | null {
  if (!title.trim()) return 'Enter a title';
  if (title.trim().length > 120) return 'The title is too long (120 characters at most)';
  if (!body.trim()) return 'Write the announcement';
  if (body.trim().length > 4000) return 'The message is too long (4000 characters at most)';
  return null;
}

export interface MeetingFormInput {
  title: string;
  meetingNumber: string;
  date: string;
  time: string;
  duration: string;
}

export function validateMeetingForm(f: MeetingFormInput): string | null {
  if (!f.title.trim()) return 'Enter a title';
  if (!isValidMeetingNumber(f.meetingNumber)) return 'A meeting number has 9 to 11 digits';
  if (!parseLocalDateTime(f.date, f.time)) return 'Enter the date as YYYY-MM-DD and the time as HH:MM';
  const mins = Number(f.duration);
  if (!Number.isInteger(mins) || mins < 5 || mins > 1440) return 'Duration must be 5 to 1440 minutes';
  return null;
}
