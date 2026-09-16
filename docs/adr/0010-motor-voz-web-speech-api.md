---
status: accepted
date: 2026-08-27
deciders: [propietario del proyecto, investigacion FEAT-004]
---

# 0010. El motor de voz es Web Speech API; la sincronización de boca inicial usa eventos de palabra, no amplitud

## Context and Problem Statement

`docs/how-to/evaluar-motor-de-voz.md` pedía comparar cinco familias de TTS (Web Speech API, motores nativos, TTS local, TTS remoto, proveedores comerciales) en doce dimensiones, incluyendo acceso a amplitud de audio para sincronizar la boca del avatar, y decidir cómo obtenerla — sabiendo que la implementación inicial podía partir de amplitud, siempre que la interfaz permitiera sustituirla después.

## Considered Options

- **Web Speech API** (`speechSynthesis`, nativa del WebView/Chromium): sin costo, sin licencia, usa las voces ya instaladas en Windows, funciona sin conexión.
- **TTS local** (modelo neuronal on-device tipo Piper): produce un buffer de audio real, permite amplitud real, pero aumenta el tamaño de la descarga y requiere evaluar la licencia de la voz específica antes de incorporarla.
- **TTS remoto/comercial**: requiere conexión y, en la mayoría de los casos, licencia de pago — incompatible con "aplicación gratuita" sin que alguien asuma ese costo.

## Decision Outcome

Elegida: **Web Speech API** para la implementación inicial. Es la única opción sin ningún costo ni obligación de licencia (no redistribuye ningún asset de voz, delega en el sistema operativo), funciona sin conexión, y es la más simple de integrar sobre el WebView de Tauri.

**Hallazgo que corrige el supuesto del `how-to`:** se confirmó (documentación oficial de la API, MDN/spec) que Web Speech API **no expone el audio sintetizado como un nodo conectable a `AnalyserNode`** — no hay forma de obtener amplitud real de esta API. La implementación inicial de sincronización de boca usa el evento `boundary` (marca de tiempo por palabra) como aproximación de movimiento de boca, **no amplitud** — es una limitación real y confirmada del motor elegido, no una implementación parcial de lo que se pidió.

La interfaz `TextToSpeech` se mantiene sin cambios (`speak`/`stop`/`pause`/`resume`); la sincronización de boca vive en `AvatarController`, desacoplada, para que sustituir la fuente de la animación (de `boundary` a amplitud real) no requiera tocar el resto — el upgrade path es un motor con buffer de audio propio (TTS local), documentado pero no implementado en este Epic.

### Consequences

- Positiva: cero costo, cero riesgo legal, funciona sin conexión — la opción más simple resultó también la más alineada con "aplicación gratuita".
- Positiva: los seis comportamientos obligatorios del `how-to` (no bloquear, cancelar, cola, no duplicados, accesibilidad, no intrusivo en mascota) se resuelven con la API nativa sin trabajo adicional.
- Negativa: la sincronización de boca inicial es una aproximación por palabra, no una forma de onda real — el movimiento de boca será menos preciso que con amplitud real hasta que se implemente el upgrade.
- Neutral: si en el futuro se necesita amplitud real desde el día uno de una feature, esta decisión se revisita con el trade-off de tamaño de descarga que implica un motor local.

## More Information

- `docs/research/avatar-and-tts.md`, sección de voz.
- Corrección aplicada en `docs/reference/avatar-reacciones-voz.md`, sección "Sincronización de boca".
- REV-13, `flujo_projects/codetuver-avatar/04_pruebas/evidencia/REV-13.md`.
