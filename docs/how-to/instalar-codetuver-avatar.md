---
id: how-to-instalar-codetuver-avatar
title: Instalar Codetuver Avatar desde el paquete publicado
type: how-to
status: current
source: both
last_verified: 2026-08-29
symbols: []
related: [ref-licencias-y-atribuciones]
---

# Instalar Codetuver Avatar desde el paquete publicado

Cubre **US-030 / AC-030.1 y AC-030.4**. Esta guía asume que ya tienes **el paquete instalable ya compilado** (el `.msi`/`.exe` que produce `npm run tauri build`, distribuido junto a esta documentación) — no cubre compilar la aplicación desde el código fuente. Si necesitas compilar desde código fuente, el requisito adicional es el toolchain de Rust (`cargo`) y Node 22 LTS declarados en `docs/adr/0002-stack-tauri-rust-vue.md`; esa ruta no es la de un usuario final y no se documenta aquí.

## 1. Requisitos previos

- **Windows** (única plataforma soportada — ver `docs/adr/0002-stack-tauri-rust-vue.md` §Consequences: macOS y Linux quedan fuera de alcance).
- **Claude Code instalado y autenticado por separado.** El paquete de Codetuver Avatar **no instala ni autentica Claude Code** — es un requisito previo que la persona resuelve antes de abrir la aplicación, siguiendo la documentación oficial de Claude Code. Si Claude Code no está presente en el `PATH` del sistema al iniciar una sesión, la aplicación lo informa con un mensaje claro en vez de fallar sin explicación.
- Ningún runtime adicional: el paquete instalable incluye el núcleo nativo (Rust/Tauri) y el WebView del propio sistema operativo — no hace falta instalar Node ni Rust para usar la aplicación ya compilada.

## 2. Instalación

1. Descarga el instalador publicado (`.msi` o `.exe`, según el empaquetador de Windows disponible).
2. **Windows SmartScreen mostrará "Se protegió su PC" / "Editor desconocido".** El instalador no está firmado con un certificado Authenticode (decisión explícita, ver [`docs/specs/arquitectura-general/overview.md`](../specs/arquitectura-general/overview.md) — sección de principios: distribución tipo proyecto de código abierto estándar, sin el costo recurrente de una firma comercial) — es la misma advertencia que ves con la mayoría de instaladores de proyectos open source en GitHub. Haz clic en **"Más información"** y luego **"Ejecutar de todas formas"** para continuar.
3. Sigue el asistente — sin pasos adicionales fuera de lo que el instalador pide.
4. Abre Codetuver Avatar desde el acceso directo que crea el instalador.

## 3. Primer inicio de sesión

1. Elige la carpeta de trabajo del proyecto sobre el que quieres que Claude Code opere.
2. Inicia la sesión. Si Claude Code está instalado y autenticado, la sesión arranca con normalidad.
3. Si ves un mensaje indicando que no se encontró Claude Code instalado: instálalo y autentícalo por separado (ver el requisito previo arriba), y vuelve a intentar iniciar la sesión.

## 4. Licencias y atribuciones

Cada personaje incluido y cada dependencia distribuida en este paquete tiene su licencia y atribución documentada en `docs/reference/licencias-y-atribuciones.md`, incluido dentro del propio paquete instalado.

## 5. Actualizaciones

Codetuver Avatar comprueba en silencio, al iniciar, si hay una versión nueva publicada en GitHub Releases (`tauri-plugin-updater`, firmada con una clave Ed25519 propia del proyecto — este mecanismo es independiente de la firma Authenticode que el instalador no tiene, ver sección 2). Si hay una disponible, aparece un aviso no intrusivo con un botón "Descargar e instalar" — la app sigue usándose con normalidad mientras tanto. Si el chequeo falla (sin red, o el manifest de la release no está disponible todavía), no aparece ningún aviso ni se interrumpe la sesión.
