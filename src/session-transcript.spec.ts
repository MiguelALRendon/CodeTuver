import { describe, expect, it } from 'vitest';
import { transcriptToChatEntries } from './session-transcript';

describe('transcriptToChatEntries', () => {
  it('convierte un turno de persona a la forma de ChatEntry', () => {
    const result = transcriptToChatEntries([{ role: 'person', text: 'hola' }]);
    expect(result).toEqual([{ role: 'person', text: 'hola' }]);
  });

  it('convierte un turno de agente a un bloque de parrafo', () => {
    const result = transcriptToChatEntries([{ role: 'agent', text: 'ok' }]);
    expect(result).toEqual([
      { role: 'agent', blocks: [{ type: 'paragraph', text: 'ok' }] },
    ]);
  });

  it('preserva el orden de una conversacion mixta', () => {
    const result = transcriptToChatEntries([
      { role: 'person', text: 'pregunta' },
      { role: 'agent', text: 'respuesta' },
    ]);
    expect(result).toEqual([
      { role: 'person', text: 'pregunta' },
      { role: 'agent', blocks: [{ type: 'paragraph', text: 'respuesta' }] },
    ]);
  });

  it('lista vacia produce lista vacia', () => {
    expect(transcriptToChatEntries([])).toEqual([]);
  });
});
