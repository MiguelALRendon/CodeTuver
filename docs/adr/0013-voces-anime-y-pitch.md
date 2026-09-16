---
status: accepted
date: 2026-09-06
deciders: [propietario del proyecto, investigacion Hito 14 de revision-ux-sesion-real-3]
---

# 0013. No se cambia de motor de voz por ahora; se prueba `pitch` con las voces ya instaladas antes de considerar VOICEVOX

## Context and Problem Statement

El usuario pidió investigar si hay voces de estilo anime disponibles o instalables, y si el timbre actual se puede mejorar, antes de planear cualquier hito de implementación. ADR-0010 ya fijó Web Speech API como motor; esta investigación evalúa qué hay realmente disponible sobre ese motor, en esta máquina, con evidencia real.

## Investigación (evidencia real de la máquina, 2026-09-06)

**Voces expuestas por el WebView (`speechSynthesis.getVoices()`, volcado real vía CDP):**

| Voz | Idioma | Tipo |
|---|---|---|
| Microsoft Raul - Spanish (Mexico) | es-MX | local (SAPI), por omisión |
| Microsoft Sabina - Spanish (Mexico) | es-MX | local (SAPI) |

Solo 2 voces, ambas clásicas de SAPI. **Ninguna voz neuronal de Microsoft ("Online (Natural)") aparece expuesta** en esta máquina — ni siquiera se investigó una causa raíz más allá de constatar la ausencia, ya que instalar un paquete de idioma adicional para probarlo está fuera del alcance de una investigación (acción que modifica el sistema del usuario).

**`pitch` nunca se fija:** confirmado leyendo `buildUtterance()` (`text-to-speech.ts`) — solo se fijan `volume`/`rate`/`voice`; `SpeechSynthesisUtterance.pitch` (rango 0-2, por omisión 1) nunca se toca. Si tiene un efecto audible perceptible con Raul/Sabina específicamente **no se puede confirmar sin escuchar** — límite real de verificación (memoria `verificacion-sin-hardware`: un criterio que exige oído humano no es una limitación del proceso, es la naturaleza del criterio).

**Instalar voces adicionales de Windows:** Configuración → Hora e idioma → Voz → "Agregar voces", o agregar un idioma completo en Configuración → Hora e idioma → Idioma. Todas las voces que este camino instala son del mismo estilo genérico SAPI de Windows — no hay voces de estilo anime disponibles por este medio, para ningún idioma.

**VOICEVOX** (motor local japonés, evaluado contra la realidad del proyecto): expone una API HTTP local real en `localhost:50021` (`POST /audio_query` → `POST /synthesis`, devuelve WAV), documentada en Swagger en `/docs` — encajaría técnicamente detrás de la interfaz `TextToSpeech` que ya existe (`text-to-speech.ts:4-9`), el punto de inyección ya está hecho. Contra, confirmado por búsqueda: el proyecto, su instalador y sus mensajes de error están **enteramente en japonés** (existe incluso una guía no oficial en inglés precisamente porque no hay una oficial), y sus voces son personajes japoneses — mientras que la app lee respuestas en español.

## Considered Options

- **Probar `pitch` con las voces ya instaladas.** Costo casi nulo (ya está en la API que se usa), sin instalar nada nuevo, resultado audible verificable de inmediato por la persona.
- **Investigar instalar voces neuronales de Windows.** No confirmado que estén disponibles en este idioma/edición; requeriría instalar un paquete de idioma para comprobarlo.
- **Integrar VOICEVOX de todas formas.** Técnicamente viable y barato de enganchar, pero el idioma del proyecto (japonés) no coincide con el idioma de uso de la app (español) — fricción real para el usuario, no solo del desarrollo.
- **No tocar nada por ahora.**

## Decision Outcome

Elegida: **probar `pitch` con las voces ya instaladas antes de considerar cambiar de motor.** Es la opción de menor costo (una propiedad ya disponible en la API que ya se usa, sin instalar nada), y el usuario decidió explícitamente probarla primero en vez de saltar directo a investigar voces neuronales o integrar VOICEVOX pese a su idioma.

**No se integra VOICEVOX en este momento.** La barrera de idioma (instalador, errores y voces en japonés, app en español) es una fricción real para el usuario final del proyecto, no una limitación técnica — la integración sigue siendo técnicamente viable y queda documentada como camino futuro si `pitch` no basta.

**Este ADR no implementa el ajuste de `pitch`** — la implementación (ficha de `pitch` en `buildUtterance()`, control expuesto en `VoiceControls.vue` si aplica, y su verificación auditiva) es trabajo de un hito nuevo, planeado por separado.

**Actualización (Hito 15 de `revision-ux-sesion-real-5`, D16):** implementado — `pitch` se agregó a `VoiceSettings`/`VoiceSnapshot` (`text-to-speech.ts`), `buildUtterance()` lo aplica al `SpeechSynthesisUtterance` real, y `VoiceControls.vue` expone un control deslizante (mismo patrón visual que `rate`), persistido junto a `rate`/`volume` en el mismo `localStorage`. Pendiente ya no queda: la decisión de este ADR está completamente ejecutada.

### Consequences

- Positiva: costo casi nulo, sin nueva dependencia, sin instalar nada — se agota la opción más barata antes de evaluar alternativas más caras.
- Positiva: VOICEVOX queda evaluado con evidencia real (no descartado a priori) y documentado como camino futuro si hiciera falta.
- Neutral: la ausencia de voces neuronales de Microsoft en esta máquina queda registrada como observación, no como conclusión definitiva — podría deberse a un paquete de idioma no instalado, sin confirmar.
- Negativa: si `pitch` no produce una mejora perceptible, esta decisión se revisita y las opciones descartadas (voces neuronales de Windows, VOICEVOX) vuelven a la mesa.

## More Information

- Volcado real de voces y confirmación del código: sesión de investigación del Hito 14 de `specs/revision-ux-sesion-real-3/plan.md`, 2026-09-06.
- `docs/reference/avatar-reacciones-voz.md`, sección de voz.
- ADR-0010 (motor de voz base, sin cambios).
