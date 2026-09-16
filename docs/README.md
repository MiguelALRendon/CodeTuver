# docs/ — índice

## Empieza aquí: `specs/`

**[`specs/arquitectura-general/overview.md`](specs/arquitectura-general/overview.md)** es el punto de entrada real de toda la documentación técnica del proyecto. `specs/` documenta, dominio por dominio, cómo funciona la aplicación **hoy**, verificado directamente contra el código real — no contra la historia de cómo se construyó. Cada dominio tiene exactamente dos archivos:

| Archivo | Contenido |
|---|---|
| `overview.md` | Propósito del dominio, flujos reales, principios y decisiones que gobierna, referencias cruzadas a otros dominios. |
| `reference.md` | Tabla función-por-función, componente-por-componente: cada archivo real, cada método, cada botón, cada estado — con capturas de pantalla reales. |

Dominios: [`arquitectura-general`](specs/arquitectura-general/overview.md) (índice y mapa de comandos Tauri) · [`sesion-y-transporte`](specs/sesion-y-transporte/overview.md) · [`chat-y-contenido`](specs/chat-y-contenido/overview.md) · [`gestion-de-personajes`](specs/gestion-de-personajes/overview.md) · [`animacion-y-render`](specs/animacion-y-render/overview.md) · [`reacciones-y-voz`](specs/reacciones-y-voz/overview.md) · [`presentacion-y-ventana`](specs/presentacion-y-ventana/overview.md) · [`administracion-y-configuracion`](specs/administracion-y-configuracion/overview.md) · [`ui-compartida`](specs/ui-compartida/overview.md) · [`robustez-y-actualizaciones`](specs/robustez-y-actualizaciones/overview.md) · [`orquestacion-app`](specs/orquestacion-app/overview.md).

Si un documento fuera de `specs/` contradice a `specs/`, **`specs/` manda** — es el único conjunto de documentos mantenido como espejo directo del código actual.

## El resto de `docs/`

Organizado por [Diataxis](https://diataxis.fr/) — material que complementa a `specs/` sin duplicarlo:

| Carpeta | Modo | Qué contiene |
|---|---|---|
| `how-to/` | Guía práctica | Resolver una tarea concreta — instalar, investigar, evaluar. Pasos, no teoría. |
| `adr/` | Decisión de arquitectura | Registro histórico de decisiones (formato MADR) con contexto, opciones consideradas y consecuencias. No se reescribe con cambios posteriores — para el estado actual de una decisión, ver el dominio de `specs/` correspondiente. |
| `reference/` | Referencia y evidencia | Licencias y atribuciones distribuidas (`licencias-y-atribuciones.md`, vigente), más el rastro histórico de auditorías de QA/seguridad/accesibilidad del lanzamiento (`qa-*`, `auditoria-*`, `security-review-*`) y capturas de pantalla (`screenshots/`). Los archivos que describían funcionalidad (`avatar-reacciones-voz.md`, `bloques-contenido.md`, `modelo-eventos.md`, etc.) son anteriores a `specs/` y pueden estar desactualizados — para el comportamiento real, usar siempre `specs/`. |
| `explanation/` | Explicación | El porqué histórico de decisiones de diseño puntuales — contexto, no contrato vigente. |
| `research/` | Investigación | Informes históricos de la investigación inicial (EPIC-001) y sus fixtures. |
| `_inbox/` | Histórico | Documentos migrados o superados. |

`ARCHITECTURE.md` conserva vigente su sección "Pendiente de EPIC-001" (el registro de decisiones de arquitectura grandes aún abiertas); para el mapa general del sistema usa [`specs/arquitectura-general/overview.md`](specs/arquitectura-general/overview.md) en su lugar. Principios de producto: [`constitution.md`](constitution.md).

Instalación desde el paquete publicado: [`how-to/instalar-codetuver-avatar.md`](how-to/instalar-codetuver-avatar.md). Licencias y atribuciones de lo distribuido: [`reference/licencias-y-atribuciones.md`](reference/licencias-y-atribuciones.md).
