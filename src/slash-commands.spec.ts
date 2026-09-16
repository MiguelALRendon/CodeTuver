import { describe, expect, it } from 'vitest';
import {
  filterCommands,
  nextCommandIndex,
  commandToCommitText,
  resolveCommandsEmptyStateMessage,
} from './slash-commands';

describe('filterCommands', () => {
  const commands = ['commit', 'compact', 'help'];

  it('filtra por substring, sin importar mayusculas', () => {
    expect(filterCommands(commands, 'COM')).toEqual(['commit', 'compact']);
  });

  it('filtro vacio devuelve la lista completa', () => {
    expect(filterCommands(commands, '')).toEqual(commands);
  });

  it('sin coincidencias devuelve una lista vacia', () => {
    expect(filterCommands(commands, 'zzz')).toEqual([]);
  });
});

describe('nextCommandIndex', () => {
  it('ArrowDown avanza sin pasar del ultimo indice', () => {
    expect(nextCommandIndex(0, 3, 'down')).toBe(1);
    expect(nextCommandIndex(2, 3, 'down')).toBe(2);
  });

  it('ArrowUp retrocede sin bajar de 0', () => {
    expect(nextCommandIndex(1, 3, 'up')).toBe(0);
    expect(nextCommandIndex(0, 3, 'up')).toBe(0);
  });

  it('lista vacia siempre devuelve 0', () => {
    expect(nextCommandIndex(0, 0, 'down')).toBe(0);
    expect(nextCommandIndex(0, 0, 'up')).toBe(0);
  });
});

describe('commandToCommitText', () => {
  it('Enter sobre un indice valido escribe el texto del comando sin enviarlo', () => {
    expect(commandToCommitText(['commit', 'compact'], 1)).toBe('/compact');
  });

  it('un indice fuera de rango (lista vacia) no produce texto', () => {
    expect(commandToCommitText([], 0)).toBeNull();
  });
});

describe('resolveCommandsEmptyStateMessage', () => {
  it('sin sessionId, avisa que los comandos llegan tras el primer mensaje', () => {
    expect(resolveCommandsEmptyStateMessage(null, [], '')).toBe(
      'Los comandos se habilitan después de tu primer mensaje.',
    );
  });

  it('con sessionId pero sin comandos personalizados, lo dice explicito', () => {
    expect(resolveCommandsEmptyStateMessage('s1', [], '')).toBe(
      'Este proyecto no tiene comandos personalizados.',
    );
  });

  it('con comandos pero sin coincidencias, interpola el texto escrito', () => {
    expect(
      resolveCommandsEmptyStateMessage('s1', ['commit', 'compact'], 'zzz'),
    ).toBe('Sin coincidencias para "zzz".');
  });

  it('con coincidencias reales, no hay mensaje que mostrar', () => {
    expect(
      resolveCommandsEmptyStateMessage('s1', ['commit', 'compact'], 'com'),
    ).toBeNull();
  });
});
