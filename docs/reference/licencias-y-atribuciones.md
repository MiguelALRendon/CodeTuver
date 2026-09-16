---
id: ref-licencias-y-atribuciones
title: Licencias y atribuciones
type: reference
status: current
source: both
last_verified: 2026-09-02
symbols: [CHARACTER_CATALOG]
related: [ref-configuracion-persistente]
---

# Licencias y atribuciones

Cubre **US-030 / AC-030.2, AC-030.3, R9**. Una entrada por personaje incluido en el paquete y una por cada dependencia de runtime distribuida junto a la aplicación (no se listan `devDependencies`: esas no se distribuyen). Ninguna licencia de esta lista está adivinada — cada una se verificó contra su fuente real (`package.json` en `node_modules/` para las dependencias de Node, `cargo metadata` contra el registro de crates.io para las de Rust).

Este archivo se copia dentro del paquete publicado (`src-tauri/tauri.conf.json` → `bundle.resources`), para que la atribución viaje con la descarga y no solo con el repositorio (decisión **D8**).

## Personajes incluidos

Las 3 entradas reales de `CHARACTER_CATALOG` (`src/character-catalog.ts`), los personajes VRM distribuidos con el paquete. Los personajes de prueba SVG/CSS ("Prueba Violeta"/"Prueba Verde") documentados en una versión anterior de esta tabla ya no existen en el código — fueron reemplazados por este catálogo VRM real.

| Personaje | Autor | Licencia | Atribución requerida |
|---|---|---|---|
| Rabbit (`rabbit`) | Polygonal Mind / colección 100Avatars | CC0 declarado por el agregador ToxSam/open-source-avatars; el repo original PolygonalMind/100Avatars no tiene archivo LICENSE propio (404 en la API de GitHub, issue #2 "Missing license" sin resolver desde 2021). El README original solo pide no revender sin modificación mayor, no es CC0 puro. **Distribución pública (`lanzamiento-publico` Hito 9, D7): gateado tras aviso legal de primer uso** — la persona debe aceptar explícitamente este riesgo (una vez por instalación, `character-license-consent.ts`) antes de poder seleccionar este personaje; ya no es una aceptación heredada de un commit que nadie más ve. | Modelo #059 de la colección 100Avatars (PolygonalMind/100Avatars), redistribuido vía ToxSam/open-source-avatars. |
| Polydancer (`polydancer`) | Polygonal Mind / colección 100Avatars | Mismo disclaimer que Rabbit (misma fuente, mismo riesgo, mismo gate de aceptación explícita — independiente por personaje). | Modelo #021 de la colección 100Avatars (PolygonalMind/100Avatars), redistribuido vía ToxSam/open-source-avatars. |
| Alicia Solid (`alicia-solid`) | Dwango Co., Ltd. (diseño: Kouhaku Kuroboshi, modelado: Kei Ukoku) | Términos VRoid Hub para Alicia Solid: permite uso como avatar, uso comercial no lucrativo individual y corporativo, redistribución y alteración del modelo. | Modelo de muestra oficial del formato VRM (VRM Consortium / Dwango), incluido como fixture de pruebas en vrm-c/UniVRM. |

## Voz

El motor de voz es **Web Speech API** (`docs/adr/0010-motor-voz-web-speech-api.md`), que usa las voces ya instaladas en el sistema operativo. La aplicación **no redistribuye ningún archivo de audio ni de voz**: no hay licencia de voz que declarar aquí.

## Dependencias de runtime distribuidas

### Node (`package.json` → `dependencies`)

| Dependencia | Versión verificada | Licencia |
|---|---|---|
| `@tauri-apps/api` | 2.11.1 | Apache-2.0 OR MIT |
| `@tauri-apps/plugin-dialog` | 2.7.2 | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-notification` | 2.3.3 | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-opener` | 2.5.4 | MIT OR Apache-2.0 |
| `vue` | 3.5.42 | MIT |

### Rust (`src-tauri/Cargo.toml` → `[dependencies]`)

| Dependencia | Versión verificada | Licencia |
|---|---|---|
| `tauri` | 2.11.5 | Apache-2.0 OR MIT |
| `tauri-plugin-opener` | 2.5.4 | Apache-2.0 OR MIT |
| `tauri-plugin-dialog` | 2.7.2 | Apache-2.0 OR MIT |
| `tauri-plugin-notification` | 2.3.3 | Apache-2.0 OR MIT |
| `serde` | 1.0.229 | MIT OR Apache-2.0 |
| `serde_json` | 1.0.151 | MIT OR Apache-2.0 |
| `tokio` | 1.53.1 | MIT |

Todas las dependencias de runtime distribuidas son de licencia permisiva (MIT y/o Apache-2.0), compatibles con distribución gratuita sin obligación de redistribuir código fuente propio.
