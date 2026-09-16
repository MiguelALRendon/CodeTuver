import { describe, expect, it } from 'vitest';
import {
  describeMcpLoginOutcome,
  isPluginNamespacedMcp,
  pluginNamespaceNotice,
} from './mcp-auth-outcome';

describe('isPluginNamespacedMcp / pluginNamespaceNotice', () => {
  it('un nombre con prefijo plugin: se reconoce como servidor de plugin', () => {
    expect(isPluginNamespacedMcp('plugin:figma:figma')).toBe(true);
    expect(pluginNamespaceNotice('plugin:figma:figma')).toContain('plugin');
  });

  it('un nombre sin prefijo plugin: no produce aviso adicional', () => {
    expect(isPluginNamespacedMcp('figma')).toBe(false);
    expect(pluginNamespaceNotice('figma')).toBeNull();
  });
});

describe('describeMcpLoginOutcome', () => {
  it('un resultado confirmado muestra el aviso de exito, sin error', () => {
    const result = describeMcpLoginOutcome('figma', { kind: 'confirmed' });

    expect(result.notice).toContain('figma');
    expect(result.error).toBeNull();
  });

  it('un resultado en curso muestra el mismo aviso de exito, sin error', () => {
    const result = describeMcpLoginOutcome('figma', {
      kind: 'still-in-progress',
    });

    expect(result.notice).toContain('figma');
    expect(result.error).toBeNull();
  });

  it('un fallo temprano nunca muestra el aviso de exito, solo el mensaje real', () => {
    const result = describeMcpLoginOutcome('figma', {
      kind: 'failed-early',
      message: 'no such MCP server figma',
    });

    expect(result.notice).toBeNull();
    expect(result.error).toBe('no such MCP server figma');
  });

  it('un servidor plugin: agrega su aviso incluso cuando el login confirma exito', () => {
    const result = describeMcpLoginOutcome('plugin:figma:figma', {
      kind: 'confirmed',
    });

    expect(result.notice).toContain('plugin');
  });

  it('un servidor plugin: agrega su aviso junto al mensaje de error real, sin ocultarlo', () => {
    const result = describeMcpLoginOutcome('plugin:figma:figma', {
      kind: 'failed-early',
      message: 'unknown mcp server',
    });

    expect(result.error).toBe('unknown mcp server');
    expect(result.notice).toContain('plugin');
  });
});
