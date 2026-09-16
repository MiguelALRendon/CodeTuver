> **Nota de reconstrucción (2026-08-27):** este archivo se perdió en un borrado accidental de la raíz del proyecto y no existe backup ni transcripción con su contenido íntegro (nunca se abrió con `Read`, `Write` ni `Edit` en ninguna sesión registrada de Claude Code). Se reescribió a partir de las decenas de citas textuales y referencias a secciones y reglas ("R2".."R12", "§5", "§8", "§9", "§10", "§12", "§Restricciones", "§Fuera de alcance", "§Lo que nunca se suelta", "§Definición de calidad", "§Proposito") que sobrevivieron dispersas en `CLAUDE.md` y en los seis `specs/*/plan.md`, `spec.md` y `design.md`. Donde existe una cita literal se marca entre comillas; el resto es reconstrucción razonada y debe verificarse contra la intención original del propietario del proyecto.

# Constitución — Codetuver Avatar

## Propósito

Codetuver Avatar existe para resolver tres molestias concretas del uso diario de Claude Code en una terminal (`flujo_projects/codetuver-avatar/02_entendimiento.md` §1):

1. **No se sabe de un vistazo en qué está** el agente — hay que leer las últimas líneas para deducir si piensa, lee, ejecuta o está detenido.
2. **Las peticiones de autorización pasan desapercibidas** — la sesión puede quedarse minutos detenida esperando un "sí" que nadie vio.
3. **Trabajar acompañado de una terminal es árido** — no hay ninguna señal de presencia, ánimo ni progreso más allá del texto.

La capa de presentación aporta un modo de trabajo activo (no solo un visor pasivo) para responder a la primera y la tercera; la señal de atención en modo mascota existe para responder a la segunda.

## Principio rector

**Claude Code es el único agente real.** Codetuver Avatar no implementa otro agente LLM, no reproduce su razonamiento ni simula sus respuestas — es una capa de presentación sobre un proceso ajeno que sigue siendo el agente (ver `docs/adr/0002-stack-tauri-rust-vue.md` y ADR-0003).

## Principios de diseño

Lista numerada — solo el punto 4 sobrevivió citado; el resto de la lista (1, 2, 3, 5…) no tiene fuente recuperable y no se inventa aquí.

4. "Un permiso que se lee mal es un permiso que se concede mal." — el contexto técnico de una petición de autorización (comando, ruta, operación exacta) se muestra legible y completo antes de ofrecer la decisión.

## Reglas de negocio

| Regla | Enunciado |
|---|---|
| **R2** | Cambiar de modo de presentación no detiene, no reinicia y no duplica la sesión del agente; los eventos siguen llegando y las peticiones pendientes siguen pendientes. |
| **R3** | Ninguna señal de atención, cambio de modo, cierre de ventana ni vencimiento de tiempo responde una petición de autorización por sí misma. Restaurar la ventana no responde nada. |
| **R4** | Ninguna capa puede matar la sesión: un fallo del avatar, la voz, el intérprete o la ventana degrada esa capa y deja la sesión de Claude Code viva. |
| **R5** | Siempre existe un camino a la salida cruda original, sin importar cuánto la interprete la capa de presentación. |
| **R6** | "La estética anime no sacrifica legibilidad, especialmente en código, errores, comandos y permisos." |
| **R7** | La voz habla solo cuando la capa de personalidad lo decide, no en cada acción técnica. La consola puede mostrarlo todo; la voz no. |
| **R8** | Nada con forma de credencial, token o clave llega al archivo de configuración persistente que la aplicación escribe. Frontera de confianza; no se simplifica jamás. |
| **R9** | Un personaje o una voz incorporados a la descarga (aplicación gratuita) necesitan licencia de redistribución explícita y atribución documentada. Sin ella, no entran al catálogo. |
| **R10** | Lo que la persona importa se queda en su equipo — nunca viaja a ningún servicio externo. Privacidad como frontera de confianza, no como opción. |
| **R11** | Cambiar o editar el personaje activo no interrumpe la sesión de Claude Code en curso; el cambio es en caliente. |
| **R12** | Prohibido pilotar el menú de la terminal interactiva simulando pulsaciones o clics. |

## §5 — Autorización nunca se concede sola

La aplicación nunca concede ni deniega una petición de autorización por su cuenta: ni por vencimiento de tiempo, ni por cambio de modo, ni por cierre de ventana, ni por señal de atención. El modo mascota nunca convierte una petición pendiente en un permiso concedido. Es la regla que la aplicación entera existe para no romper.

## §8 — Theme-first

Todo valor visual sale de tokens en `src/assets/styles/constants.css`; cero valores quemados. Se hace cumplir con la etapa `theme-check` del guantelete (`blocking: hard`) — **lo aplica el guantelete, no la buena voluntad**.

## §9 — Ninguna decisión de arquitectura grande sin su entrada en EPIC-001

Ninguna decisión de arquitectura grande se cierra sin su entrada en EPIC-001 (`docs/ARCHITECTURE.md` §"Pendiente de EPIC-001"). Un contrato de `docs/reference/` que la investigación de EPIC-001 no confirme se queda en `proposed` y se declara así — no se promueve por inercia. Inventar el resultado de una investigación pendiente es el error que EPIC-001 existe para evitar.

## §10 — Privacidad

Los datos de la persona se quedan en su equipo. Ningún archivo que la aplicación escriba, ninguna sesión, ninguna telemetría ni informe de fallo remoto sale del equipo (ver R8, R10).

## §12 — Sin dependencias nuevas sin justificar

Sin marcos de trabajo ni dependencias adicionales sin justificarlos: si el stack ya elegido resuelve el problema, una dependencia nueva no se justifica.

## §Restricciones

- **Prohibido abrir una terminal externa** (PowerShell, CMD u otra) como mecanismo de visualización de la actividad del agente.
- **Windows 11 es la única plataforma construida y probada.** macOS, Linux y Windows 10 quedan fuera.
- Distribución **gratuita**; sin tiendas de aplicaciones ni versión de pago.
- Un personaje sin un control (p. ej. cejas) no gana ese control por editarlo en el editor incluido.
- Ninguna operación simula pulsaciones o clics sobre el menú de la terminal interactiva de Claude Code (R12).

## §Fuera de alcance

- Una herramienta para crear personajes desde cero — el editor **ajusta** personajes existentes, no dibuja ni modela.
- Un modelo de IA para decidir reacciones — el motor de reacciones es **determinista y auditable** (ver ADR-0003, `accepted`).

> Nota: "sin firma de código ni actualizaciones automáticas" y "sin telemetría" aparecen citados contra `spec.md §"Fuera de alcance"` de Epics concretos (p. ej. `robustez-distribucion`), no directamente contra este archivo — se excluyen de aquí para no atribuirles un alcance global que no está evidenciado. La restricción de telemetría global sí está cubierta por §10 (Privacidad) más abajo.

## §Lo que nunca se suelta

La validación en fronteras de confianza, la accesibilidad y la seguridad **nunca se simplifican**, sin importar el ladder anti-sobreingeniería aplicado al resto del código:

- Validación de toda entrada que cruce una frontera de confianza (un archivo importado, una respuesta de formulario) antes de aceptarla.
- Contraste mínimo **medido** sobre la paleta real (4.5:1 texto normal, 3:1 texto grande) — un número declarado y no medido no es una verificación.
- Un archivo dañado o de formato no soportado se rechaza con motivo, **sin cerrar la aplicación**.

## §Definición de calidad

Los escenarios Gherkin son documentación viva y prueba de aceptación al mismo tiempo — se generan para todo Epic que produzca comportamiento observable por una persona; un Epic que no produce ningún comportamiento de producto observable (como EPIC-001, que es investigación) no genera Gherkin ceremonial sobre documentos.
