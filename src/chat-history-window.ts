export const CHAT_HISTORY_CHUNK_SIZE = 24;

// D13: pura y testeable -- nunca revela mas de lo que realmente existe, y nunca reduce lo ya visible (hallazgo real en vivo: el centinela puede disparar con la lista todavia vacia, total=0 < current).
export function revealMoreEntries(current: number, total: number): number {
  return Math.max(current, Math.min(current + CHAT_HISTORY_CHUNK_SIZE, total));
}
