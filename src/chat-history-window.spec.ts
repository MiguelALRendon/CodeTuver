import { describe, expect, it } from 'vitest';
import {
  CHAT_HISTORY_CHUNK_SIZE,
  revealMoreEntries,
} from './chat-history-window';

describe('revealMoreEntries (D13)', () => {
  it('revela un chunk mas cuando hay historial suficiente', () => {
    expect(revealMoreEntries(24, 100)).toBe(24 + CHAT_HISTORY_CHUNK_SIZE);
  });

  it('nunca excede el total real, aunque el chunk lo pasaria', () => {
    expect(revealMoreEntries(24, 30)).toBe(30);
  });

  it('ya en el total, revelar mas no cambia nada', () => {
    expect(revealMoreEntries(30, 30)).toBe(30);
  });

  it('con menos entradas que un chunk desde el inicio, el total manda', () => {
    expect(revealMoreEntries(5, 5)).toBe(5);
  });

  it('nunca reduce lo ya visible si el centinela dispara con la lista todavia vacia (hallazgo real en vivo)', () => {
    expect(revealMoreEntries(24, 0)).toBe(24);
  });
});
