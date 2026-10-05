const pad = (n: number) => String(n).padStart(2, '0');

/** "3:07 PM" */
export function formatTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export const sameDay = (a: number, b: number): boolean => startOfDay(a) === startOfDay(b);

/** "Today", "Yesterday" or "Oct 5, 2026". */
export function formatDay(ms: number, now = Date.now()): string {
  const day = startOfDay(ms);
  const today = startOfDay(now);
  if (day === today) return 'Today';
  if (day === startOfDay(today - 12 * 3600 * 1000)) return 'Yesterday';
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Chat-list timestamp: time today, "Yesterday", otherwise "Oct 5". */
export function formatListTime(ms: number, now = Date.now()): string {
  const label = formatDay(ms, now);
  if (label === 'Today') return formatTime(ms);
  if (label === 'Yesterday') return label;
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
