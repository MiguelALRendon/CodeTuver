---
id: ref-bloques-contenido
title: Bloques de contenido semántico
type: reference
status: current
source: both
last_verified: 2026-08-27
symbols: []
related: [ref-modelo-eventos, exp-no-depender-de-texto-fragil, how-to-investigar-integracion-claude-code, research-claude-code-integration]
---

# Bloques de contenido semántico

> **Estado: confirmado por FEAT-001 (Hito 1).** Markdown, código, diffs, tablas y ASCII art llegan como **un único string de texto plano** dentro de los eventos de `stream-json` (`text_delta`/`assistant.message.content[].text`) — el transporte no los separa por él mismo; el intérprete que este documento define sigue siendo necesario tal cual estaba diseñado. Evidencia: `docs/research/fixtures/10-formatos-markdown-codigo-diff-tabla-ascii.json`. No se confirmaron secuencias ANSI de color en las pruebas realizadas (los prompts de prueba no las produjeron) — queda `[NO-VERIFICADO]` si Claude Code las emite alguna vez en salida no interactiva; el parser debe tolerarlas sin romperse aunque no se hayan visto.

Claude Code emite Markdown, código, tablas, listas, citas, enlaces, diffs y arte ASCII. **No basta con un lector Markdown genérico**: hace falta una capa de interpretación semántica que convierta ese texto en bloques tipados, para que la presentación pueda darles forma propia sin alterar su significado.

## Cadena de interpretación

```text
Raw Claude Output
        ↓
Streaming Buffer
        ↓
Markdown / ANSI / ASCII Parser
        ↓
Semantic Content Blocks
        ↓
Anime-Oriented Renderer
```

## Contrato — confirmado por el Hito 1 de `contenido-transparencia` (`src/content-interpreter.ts`)

```typescript
interface DiffLine {
  content: string;
}

type ContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "code"; language?: string; code: string }
  | { type: "diff"; file?: string; additions: DiffLine[]; deletions: DiffLine[] }
  | { type: "file_reference"; path: string; action?: "read" | "write" | "modify" | "delete" }
  | { type: "command"; command: string; status?: "pending" | "running" | "success" | "failed" }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "ascii_art"; content: string; detectedTheme?: string }
  | { type: "warning"; text: string }
  | { type: "error"; text: string }
  | { type: "plain_text"; text: string };
```

## Qué debe resolver el intérprete

- Qué sintaxis Markdown aparece realmente y qué extensiones o variantes usa.
- Cómo llegan bloques de código, diffs, tablas, listas anidadas, rutas de archivos, comandos, advertencias y diagramas ASCII.
- Qué secuencias de escape o colores ANSI pueden aparecer.
- Qué contenido llega **fragmentado por streaming**, cómo detectar que un bloque está incompleto y cómo evitar que el parser rompa texto recibido a medias.
- Cómo preservar el contenido original intacto.

## Presentaciones derivadas

Los bloques se transforman en tarjetas de archivo, tarjetas de comando, paneles de resultado, diffs con color y animación, indicadores de progreso, burbujas de diálogo, ventanas de advertencia, paneles de decisión, diagramas ASCII enmarcados, código resaltado y tablas con la estética de la aplicación. Los efectos visuales sobre mensajes importantes se mantienen moderados.

## Tres vistas obligatorias

Siempre debe poder verse:

1. La representación estilizada.
2. El Markdown interpretado.
3. La salida cruda original.

**La estilización nunca altera el significado técnico ni oculta información relevante.** Si el parser falla, la salida cruda sigue disponible — ver [Por qué no dependemos de texto frágil](../explanation/no-depender-de-texto-fragil.md).
