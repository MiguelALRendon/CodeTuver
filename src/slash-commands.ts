export function filterCommands(
  commands: readonly string[],
  filterText: string,
): string[] {
  const needle = filterText.toLowerCase();
  return commands.filter((name) => name.toLowerCase().includes(needle));
}

export function nextCommandIndex(
  current: number,
  count: number,
  direction: 'up' | 'down',
): number {
  if (count === 0) return 0;
  if (direction === 'down') return Math.min(current + 1, count - 1);
  return Math.max(current - 1, 0);
}

// D17: elegir un comando escribe su texto en el borrador sin enviarlo -- null si el indice no apunta a nada (lista vacia).
export function commandToCommitText(
  commands: readonly string[],
  index: number,
): string | null {
  const name = commands[index];
  return name ? `/${name}` : null;
}

// D1: sessionId null y sendableCommands vacio se ven igual en pantalla pero tienen causas y remedios distintos.
export function resolveCommandsEmptyStateMessage(
  sessionId: string | null,
  sendableCommands: readonly string[],
  filterText: string,
): string | null {
  if (sessionId === null) {
    return 'Los comandos se habilitan después de tu primer mensaje.';
  }
  if (sendableCommands.length === 0) {
    return 'Este proyecto no tiene comandos personalizados.';
  }
  if (filterCommands(sendableCommands, filterText).length === 0) {
    return `Sin coincidencias para "${filterText}".`;
  }
  return null;
}
