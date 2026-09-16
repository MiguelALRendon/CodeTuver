import type { McpLoginOutcome } from './claude-transport';

const PLUGIN_MCP_PREFIX = 'plugin:';

export function isPluginNamespacedMcp(name: string): boolean {
  return name.startsWith(PLUGIN_MCP_PREFIX);
}

export function pluginNamespaceNotice(name: string): string | null {
  if (!isPluginNamespacedMcp(name)) return null;
  return 'La autenticacion de este servidor depende del plugin que lo publica; puede no abrir un navegador.';
}

export interface McpAuthMessage {
  notice: string | null;
  error: string | null;
}

export function describeMcpLoginOutcome(
  name: string,
  outcome: McpLoginOutcome,
): McpAuthMessage {
  const pluginNotice = pluginNamespaceNotice(name);
  if (outcome.kind === 'failed-early') {
    return { notice: pluginNotice, error: outcome.message };
  }
  const baseNotice = `Se abrio el navegador para autenticar "${name}". Completa el proceso ahi y luego actualiza esta lista.`;
  const notice = pluginNotice ? `${baseNotice} ${pluginNotice}` : baseNotice;
  return { notice, error: null };
}
