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
