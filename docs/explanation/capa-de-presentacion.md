---
id: exp-capa-de-presentacion
title: Por qué Codetuver Avatar es solo una capa de presentación
type: explanation
status: current
source: user
last_verified: 2026-08-26
symbols: []
related: [adr-0003, adr-0004, ref-presentacion-y-ventana, exp-no-depender-de-texto-fragil]
---

# Por qué Codetuver Avatar es solo una capa de presentación

## La frase que gobierna el proyecto

> «Claude Code convertido en una compañera VTuber.»

Y no:

> «Un chatbot con una imagen de anime.»

La diferencia no es estética. En la primera, lo que ves en pantalla **es** el trabajo real de un agente que está corriendo. En la segunda, es una interfaz que imita a uno. Todo lo demás en esta arquitectura se deriva de sostener la primera.

## El principio fundamental

**Claude Code es el agente real.** Por tanto:

- No se implementa otro agente LLM.
- No se intenta reproducir el razonamiento de Claude.
- No se simulan sus respuestas.
- No se construye una implementación alternativa de Claude Code.

La aplicación lanza el proceso, le habla, escucha, traduce y muestra. Nada más. El reparto de papeles queda así:

| Pieza | Aporta |
|---|---|
| Claude Code | El razonamiento. Sigue siendo el agente |
| La VTuber | Representación visual de su actividad, personalidad y estado |
| La consola propia | Transparencia técnica |
| El chat | Interacción cómoda |
| Voz y animaciones | Presencia |
| Los modos de presentación | Adaptar la experiencia a lo que la persona está haciendo |

## La cadena completa

```text
Claude Code
     ↓
Eventos normalizados
     ↓
Reaction Engine
     ↓
Avatar / Voice / UI
     ↓
Presentation Manager
     ↓
Desktop Window Manager
```

Cada flecha es unidireccional a propósito. La gestión de ventanas se mantiene **completamente separada** del transporte, del normalizador, del motor de reacciones, del avatar, del TTS, del chat y de la consola. Así cualquiera de esas partes puede evolucionar sin romper las demás.

## La consecuencia práctica: cambiar de modo no toca a Claude

Este es el punto donde una arquitectura descuidada se rompe. Si la presentación conociera al proceso, cambiar de vista implicaría tocarlo, y tocarlo implicaría poder detenerlo.

```text
Claude Code trabajando
    ↓
Usuario cambia FULL → PET
    ↓
Claude continúa exactamente igual
    ↓
Eventos siguen llegando
    ↓
Avatar sigue reaccionando
    ↓
Claude necesita permiso
    ↓
Pet avisa al usuario
    ↓
Usuario hace clic → FULL
    ↓
Se muestra la solicitud pendiente
```

La capa de presentación solo modifica **cómo se muestra** el estado de la sesión. No detiene, no reinicia, no duplica ni altera innecesariamente el proceso. Y el `PresentationManager` no depende de detalles internos del transporte: recibe estado y eventos por interfaces públicas.

## Por qué los tres modos

No son tres pantallas: son tres relaciones distintas con el trabajo del agente.

- **Modo completo** — para trabajar e inspeccionar.
- **Modo compañera** — para disfrutar del avatar mientras la interfaz se mantiene minimalista.
- **Mascota de escritorio** — para mantener una presencia discreta mientras Claude trabaja y la persona usa otras aplicaciones.

Los tres consumen el mismo estado. Por eso el [modelo de eventos](../reference/modelo-eventos.md) exige que cada evento lleve información suficiente para los tres: un evento que solo sirva al modo completo rompe los otros dos.
