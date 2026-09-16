# Instrucciones del agente

Este proyecto usa el framework **Flujo**. El flujo detallado y las reglas viven en skills; aqui solo lo esencial.

## Contexto

Principios en @docs/constitution.md. Mapa del sistema y estado real del codigo, dominio por dominio: @docs/specs/arquitectura-general/overview.md (fuente de verdad tecnica vigente). Registro de decisiones de arquitectura pendientes de EPIC-001: @docs/ARCHITECTURE.md.

`flujo_projects/` y la carpeta raiz `specs/` (documentacion de negocio y planes por feature del proceso de construccion) se retiraron una vez `docs/specs/` quedo completo como espejo directo del codigo — no existen mas en el repositorio.

## Flujo obligatorio

Tarea no trivial (>1 archivo o >15 lineas netas, decision de arquitectura, ambiguedad, o algo nuevo) → invocar la skill `flujo` antes de tocar nada. "Done" = gates del `dod.json` en verde con evidencia mostrada, no la palabra "listo" (lo verifica el Stop hook).

## Comentarios

Tolerancia cero. Regla en @.claude/rules/comentarios.md, aplicada de forma determinista por el hook `scan-comments`.

## Stack

- **Lenguaje/runtime:** Node 22 LTS + TypeScript (presentacion) y Rust estable (nucleo Tauri). Proyecto bilingue.
- **Framework de UI:** Vue 3 con Composition API y `<script setup>`, sobre Tauri 2.
- **Bundler:** Vite.
- **Gestor de paquetes:** npm (`npm ci` en CI; el guantelete invoca por `npx`).
- **Test runner:** Vitest + Stryker JS (mutacion) del lado TS, con las pruebas junto al codigo fuente (`src/**/*.spec.ts`). Lado Rust: `cargo test`, sin etapa en el guantelete todavia.
- **Estilos:** theme-first obligatorio. Tokens en `src/assets/styles/constants.css`, en OKLCH. Cero valores visuales quemados; lo bloquea la etapa `theme-check`.

## Convenciones propias

- **Claude Code es el agente real.** No implementar otro agente LLM, no reproducir su razonamiento, no simular sus respuestas.
- **La presentacion no sabe que es escritorio.** El acceso nativo va aislado tras una capa delgada sobre `invoke`/eventos de Tauri; los componentes Vue no llaman a Tauri directamente.
- **La salida cruda se escribe antes de interpretarla** y sobrevive a cualquier fallo del interprete.
- **Ninguna capa puede matar la sesion.** Avatar, voz, interprete y ventana degradan solos.
- **Ninguna decision de arquitectura grande se cierra sin su entrada en EPIC-001** (ver @docs/ARCHITECTURE.md, seccion "Pendiente de EPIC-001").
