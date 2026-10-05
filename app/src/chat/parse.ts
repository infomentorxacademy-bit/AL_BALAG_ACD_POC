/** Parses "alice, bob  carol" into unique user ids (commas and spaces both separate). */
export function parseUserIds(input: string, exclude?: string): string[] {
  const ids: string[] = [];
  for (const part of input.split(/[,\s]+/)) {
    const id = part.trim();
    if (id && id !== exclude && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
