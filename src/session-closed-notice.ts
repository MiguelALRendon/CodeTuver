import type { SessionClosed } from './claude-transport';

export function buildUnexpectedCloseMessage(
  closed: SessionClosed,
  lastStderrLine: string | null,
): string | null {
  if (closed.expected) return null;
  const detail = lastStderrLine
    ? `: ${lastStderrLine}`
    : closed.exitCode !== null
      ? ` (codigo ${closed.exitCode})`
      : '';
  return `La sesion de Claude Code se cerro inesperadamente${detail}. Verifica que este instalado y con sesion iniciada ("claude login") e intenta de nuevo.`;
}
