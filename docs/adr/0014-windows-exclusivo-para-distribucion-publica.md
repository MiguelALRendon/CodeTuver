---
status: accepted
date: 2026-09-13
deciders: [propietario del proyecto, investigacion de planeacion de lanzamiento-publico]
---

# 0014. La app se distribuye Windows-exclusiva, declarado explicitamente

## Context and Problem Statement

`lanzamiento-publico` cambia el destino de la app de instalacion privada a **distribucion publica** (terceros desconocidos la instalan). Eso obliga a decidir, antes de plantear firma de codigo y CI, si el soporte sigue siendo exclusivo de Windows o si vale la pena abrir cross-platform. El usuario pidio explicitamente: *"si NO es necesario para la compatibilidad, la respuesta es NO, se queda exclusivo de windows"* — es decir, la decision depende de si existe lock-in tecnico real, no de preferencia.

## Investigacion (evidencia real del codigo, 2026-09-13)

- `src/desktop-window-manager.ts` (capa que gobierna transparencia, siempre-encima, tamano y posicion de ventana) usa exclusivamente la API oficial cross-platform de Tauri (`@tauri-apps/api/window`) — cero llamadas Win32 crudas en la capa de presentacion.
- `src-tauri/src/*.rs`: exactamente 2 bloques `#[cfg(windows)]`, ambos en `claude_transport.rs` y `claude_admin.rs`, ambos acotados a fijar `CREATE_NO_WINDOW` al lanzar procesos hijos — no hay logica de negocio dentro de esos bloques, solo una bandera de creacion de proceso especifica de Windows.
- `src-tauri/Cargo.toml`: dependencias son `tauri`, `tauri-plugin-opener`, `tauri-plugin-dialog`, `tauri-plugin-notification`, `serde`/`serde_json`, `tokio` — ningun crate exclusivo de Windows.
- `src-tauri/tauri.conf.json` si tiene una eleccion deliberada: `"effects": ["micaDark"]`, el efecto visual Mica, exclusivo de Windows 11, sin fallback declarado para otras plataformas.
- Cero evidencia en el repositorio de ningun build, prueba, o corrida en macOS/Linux — ni en CI (`.github/workflows/quality-gate.yml` corre en `ubuntu-latest` solo para TypeScript, nunca empaqueta Tauri) ni en documentacion.
- El publico objetivo declarado del proyecto (VTuber/streaming de escritorio) ya sesga fuertemente a Windows en la practica del nicho.

## Considered Options

- **Windows-exclusivo, declarado explicitamente.** Sin trabajo adicional de portabilidad; firma de codigo se resuelve solo con Authenticode; CI apunta a un unico runner (`windows-latest`).
- **Cross-platform completo (Windows + macOS + Linux).** Exigiria quitar o condicionar `micaDark`, conseguir maquinas macOS/Linux para build y prueba real (nunca hecho hasta hoy), y agregar notarizacion de Apple ademas de Authenticode — costo real de infraestructura y verificacion sin que exista lock-in tecnico que lo obligue.
- **Cross-platform sin Mica** (degradar la identidad visual en Windows para simplificar). Sacrifica una decision de producto ya tomada deliberadamente, sin que el usuario lo haya pedido.

## Decision Outcome

Elegida: **Windows-exclusivo, declarado explicitamente.** La investigacion confirma que no hay lock-in estructural que obligara la decision en ningun sentido — el codigo podria portarse sin reescritura mayor si se quisiera. La decision es de producto, no de arquitectura forzada: `micaDark` es identidad visual deliberada que no se quiere perder, no existe evidencia de que la app funcione en otra plataforma, y el publico real ya esta concentrado en Windows.

Esta decision simplifica dos partes de `specs/lanzamiento-publico/plan.md`: la firma de codigo usa solo certificado Authenticode (Hito 10), y el CI real apunta a un unico runner `windows-latest` (Hito 12) — ninguno de los dos necesita ramificarse por plataforma.

### Consequences

- Positiva: alcance de firma y CI queda acotado a un solo ecosistema, sin doble mantenimiento.
- Positiva: no se pierde `micaDark`, identidad visual ya elegida para el producto.
- Neutral: si en el futuro aparece demanda real de otra plataforma, el trabajo de portabilidad sigue siendo bajo (sin lock-in), pero no esta hecho ni probado — se reabre esta decision cuando (y si) esa demanda aparezca.
- Negativa: la base de usuarios potenciales queda limitada a Windows por decision de producto, no por limite tecnico.

## More Information

- `specs/lanzamiento-publico/spec.md`, `design.md` (D1) y `plan.md` (Hitos 10 y 12).
- Investigacion completa citada en `design.md` §1 ("Estado de partida").
