---
status: accepted
date: 2026-08-25
deciders: [propietario del proyecto]
---

> **Nota de reconstrucción (2026-08-27):** este archivo se perdió en un borrado accidental de la raíz del proyecto y no existe backup ni transcripción con su contenido íntegro. Se reescribió a partir de las citas textuales y referencias a "ADR-0002" que sobrevivieron en `CLAUDE.md`, `specs/*/plan.md` y `specs/*/design.md`. El *Decision Outcome* y el stack declarado son fieles a esas citas; el resto de las secciones (contexto, opciones descartadas, consecuencias) se reconstruyen con el mismo criterio que domina el resto del proyecto y deben tratarse como una aproximación razonada, no como el texto original palabra por palabra.

# 0002. Stack: Tauri 2 + Rust + Vue 3, sobre Node 22 LTS

## Context and Problem Statement

Codetuver Avatar es una aplicación de escritorio para Windows que debe: abrir una ventana sin bordes y transparente, lanzar y hablar con un proceso externo (Claude Code), animar un avatar VTuber con reacciones en tiempo real, y distribuirse gratis a cualquier persona que use Claude Code. Hacía falta fijar el stack antes de poder tocar código, porque cada decisión posterior — desde cómo se aísla el acceso nativo hasta qué runtime corre el guantelete — depende de él.

## Considered Options

- **Electron + framework web.** Runtime de Node embebido completo; huella de memoria y de instalador mucho mayor, y duplica un motor de renderizado que Windows ya trae.
- **Tauri 2 + Rust + Vue 3 + TypeScript.** Núcleo nativo en Rust, WebView del propio sistema operativo, superficie de proceso mucho menor.
- Frameworks de escritorio nativos sin capa web (WinUI, WPF puro) — descartados por no encajar con un frontend Vue ya pensado como capa de presentación reactiva.

## Decision Outcome

Elegida: **Tauri 2 como núcleo nativo (Rust) + Vue 3 con Composition API y `<script setup>` como capa de presentación + TypeScript + Vite como bundler + Node 22 LTS como runtime de desarrollo + npm como gestor de paquetes.**

El acceso nativo (lanzar el proceso de Claude Code, leer su actividad, controlar la ventana transparente y "siempre encima") vive detrás de una capa delgada sobre `invoke`/eventos de Tauri; los componentes Vue nunca llaman a Tauri directamente — la presentación no debe saber que es una aplicación de escritorio. Este es el ADR que la constitución y `CLAUDE.md` dan por firme: ninguna decisión de arquitectura posterior reabre el stack, solo lo consume.

### Consequences

- Positiva: instalador y huella de memoria mucho menores que Electron, relevante para una aplicación gratuita que corre junto a Claude Code y el propio editor.
- Positiva: Rust en el núcleo da acceso directo a las APIs de ventana de Windows (transparencia, click-through, siempre-encima) que el modo mascota necesita.
- Positiva: Vue 3 + Composition API encaja con una interfaz que reacciona a eventos de sesión en tiempo real sin arquitectura propia adicional.
- Negativa: dos lenguajes en el mismo repositorio (Rust + TypeScript) piden guantelete y convenciones separadas para cada lado. **Resuelto en el Hito 0 de `specs/nucleo-sesion/plan.md` (2026-08-27):** `gauntlet.json` agrega `rust-build` (`cargo check`) y `rust-test` (`cargo test`), ambas demostradas capaces de fallar de verdad ante un error introducido deliberadamente.
- Neutral: fija Windows como plataforma de construcción y prueba; macOS y Linux quedan fuera de alcance salvo que un ADR posterior lo reabra.

## More Information

- Confirmado como no-decisión en el Hito 0 de `specs/investigacion-previa/plan.md`: el andamiaje usa la plantilla oficial de Tauri sin arquitectura propia añadida.
- Stack completo declarado en `CLAUDE.md` §Stack.
