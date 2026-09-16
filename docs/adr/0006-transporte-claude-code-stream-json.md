---
status: accepted
date: 2026-08-27
deciders: [propietario del proyecto, investigacion FEAT-001]
---

# 0006. El transporte con Claude Code es un único adaptador sobre `claude -p --output-format stream-json`

## Context and Problem Statement

`docs/how-to/investigar-integracion-claude-code.md` §2 dibuja una jerarquía de cuatro adaptadores (`StructuredTransport`, `OfficialApiTransport`, `ProcessTransport`, `FallbackRawTransport`) tras una interfaz común `ClaudeCodeTransport`, para el caso de que ninguna API oficial estructurada bastara. Había que confirmar, investigando de verdad, si ese caso se daba.

## Considered Options

- Implementar los cuatro adaptadores de la jerarquía completa desde el inicio, por si alguno hiciera falta más adelante.
- Implementar solo lo que la investigación confirmó que existe y basta, con la interfaz común lista para que un adaptador adicional se sume después sin rediseñar nada.

## Decision Outcome

Elegida: **un único adaptador**, `ProcessTransport` sobre `claude -p --output-format stream-json --verbose --include-partial-messages`. La investigación (Hito 1 de `investigacion-previa`, `docs/research/claude-code-vtuber-integration.md`) confirmó con pruebas reales que esta es una API estructurada oficial y suficiente: streaming evento por evento, sin depender de parsear texto libre de stdout, con `tool_use`/`tool_result`, metadata de sesión y costo, y un evento terminal `result`. No hizo falta escalar a los tres adaptadores restantes.

Aplica el ladder anti-sobreingeniería del proyecto: construir cuatro adaptadores cuando uno cubre el caso real es la abstracción que la constitución prohíbe. La interfaz `ClaudeCodeTransport` se mantiene como contrato, de modo que un adaptador adicional (por ejemplo, si una versión futura de Claude Code rompe el formato de `stream-json`) pueda sumarse sin tocar el resto de la aplicación.

### Consequences

- Positiva: menos código, un solo camino que probar y mantener.
- Positiva: la interfaz común sigue abierta a un segundo adaptador si algún día hace falta.
- Negativa: si `stream-json` cambia de forma incompatible entre versiones de Claude Code, no hay un fallback ya implementado — solo declarado (`claude-code-vtuber-integration.md` §14).
- Neutral: el comportamiento de permisos y de cancelación de este mismo transporte quedó parcialmente sin confirmar (ver hallazgos del informe) — no cambia esta decisión, pero condiciona cómo se implementa la capa de permisos sobre este transporte.

## More Information

- Investigación completa: `docs/research/claude-code-vtuber-integration.md`.
- Fixtures reales: `docs/research/fixtures/01` a `10`.
- Contrato: `docs/reference/modelo-eventos.md`.
