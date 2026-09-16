export const CLEAR_COMMAND = '/clear';

// D6 (correcciones-qa-gauntlet Hito 6): match por primer token, no igualdad exacta -- "/clear porfavor" el proceso real de claude SI lo interpreta como /clear real, asi que debe interceptarse igual que "/clear" solo. Excluye el "/clear" exacto porque ese caso ya lo maneja el flujo existente de seleccion del listbox.
export function isClearCommandWithExtraContent(draft: string): boolean {
  const trimmed = draft.trim();
  if (trimmed === CLEAR_COMMAND) return false;
  return trimmed.split(/\s+/)[0] === CLEAR_COMMAND;
}

// D2 (revisada): beginSession/resumeSession siempre ponen sessionId en null antes de arrancar, asi que un cambio con id anterior no-nulo solo puede venir de un reset que Claude Code hizo solo.
export function isClearSessionReset(
  previousSessionId: string | null,
  newSessionId: string,
): boolean {
  return previousSessionId !== null && previousSessionId !== newSessionId;
}
