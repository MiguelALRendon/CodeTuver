---
status: accepted
date: 2026-08-30
deciders: [propietario del proyecto, planeacion animaciones-editables]
---

# 0012. Animacion de fondo y pose se combinan por huesos disjuntos autoriados; `Additive` queda como mecanismo secundario para el caso de solape

## Context and Problem Statement

`animaciones-editables` exige que una animacion en bucle (ej. balanceo de cabeza) y una pose (ej. "pensar", brazos) se reproduzcan a la vez sobre el mismo modelo VRM sin que una tumbe visualmente a la otra. Three.js no tiene, de fabrica, un sistema de "capas de animacion por hueso" equivalente al Avatar Mask de Unity Mecanim o al Layered Blend per Bone de Unreal — confirmado en el foro oficial de three.js (`docs/research/editores-3d-huesos-y-blending-animaciones.md` §3.3). Habia que decidir el mecanismo concreto antes de escribir el motor de reproduccion (Hito 1) y el contenido de fabrica (Hito 2), porque la eleccion determina como se autoria cada `AnimationClip` desde el primer clip que se escribe.

## Considered Options

- **Huesos disjuntos por autoria, con `Additive` como red de seguridad para el caso de solape:** cada animacion de fondo solo toca `head`/`neck`/`spine` superior; cada pose solo toca brazos/manos + inclinacion leve de `chest`. Reproducidas a la vez con `NormalAnimationBlendMode` (el modo por defecto de three.js), sus pistas no compiten porque no se solapan. Si una pose puntual necesita tocar un hueso que la animacion de fondo tambien usa, esa pista especifica se convierte a delta con `THREE.AnimationUtils.makeClipAdditive()` antes de reproducirse.
- **Aditivo por defecto para todo par de clips simultaneos**, sin distinguir si comparten hueso o no.
- **Filtrado de pistas en tiempo de ejecucion** (remover del `AnimationClip` ya cargado las pistas de huesos que no le corresponden a esa accion, antes de crear la `AnimationAction`).
- **Multiples `AnimationMixer`, uno por grupo de huesos** — mencionado en el foro oficial de three.js como algo que alguien estaba considerando, sin caso de exito documentado.

## Decision Outcome

Elegida: **huesos disjuntos por autoria + `Additive` para el caso de solape**. Es el patron validado por la comunidad en un hilo del foro oficial de three.js que reproduce casi exactamente el caso de uso de este proyecto (animacion de piernas + animacion de brazos simultaneas sin invadirse — `discourse.threejs.org/t/psa-solved-blending-multiple-animations-for-specific-bones-running-and-shooting/66154`, citado en `docs/research/editores-3d-huesos-y-blending-animaciones.md` §3.3). Como el contenido de fabrica se autoria por codigo (ADR pendiente de decision D3 de `design.md`, no descargado), la particion de huesos se decide directamente al escribir cada `KeyframeTrack`, sin necesitar el paso de "podar en el exportador de Blender" que el patron original describe para `.vrma` externos.

**Aditivo por defecto para todo** se descarta porque el propio informe documenta un "gotcha" real (fijar `clip.blendMode = AdditiveAnimationBlendMode` a mano sin pasar por `makeClipAdditive()` produce huesos sobre-escalados) — mas superficie de error para el caso comun (huesos disjuntos), que no lo necesita.

**Filtrado en tiempo de ejecucion** queda documentado como red de seguridad para `.vrma` importados de terceros (Hito 4) que puedan llegar con pistas de mas y no se puedan re-autoriar, pero no como mecanismo primario del contenido de fabrica.

**Multiples `AnimationMixer`** se descarta por no tener caso de exito documentado en ninguna fuente revisada — riesgo de construir sobre un patron no confirmado.

### Consequences

- Positiva: cero dependencias nuevas — `NormalAnimationBlendMode`, `AdditiveAnimationBlendMode` y `AnimationUtils.makeClipAdditive()` ya vienen en `three@^0.185.1`, la version que el proyecto ya tiene instalada.
- Positiva: el contenido de fabrica (Hito 2) puede verificarse programaticamente sin renderizar (comprobar que ningun clip de animacion toca huesos de brazos y ningun clip de pose toca `head`/`neck` directo), en vez de depender de observacion visual en un entorno sin GPU disponible — mismo patron de honestidad ya establecido en el proyecto (ADR-0005).
- Negativa: si a futuro se quiere una pose que comparta mas de un hueso con la animacion de fondo (mas alla del caso de cabeza ya previsto), cada caso nuevo de solape exige aplicar `makeClipAdditive()` explicitamente — no es automatico, hay que detectarlo por interseccion de nombres de pista (Hito 1, paso 1.5 de `plan.md`).
- Negativa: los `.vrma` importados de terceros (Hito 4) no tienen garantia de venir con huesos disjuntos — dependen del filtrado en tiempo de ejecucion (mecanismo secundario) si llegan con pistas de mas.

## More Information

- `specs/animaciones-editables/design.md`, decision D4.
- `docs/research/editores-3d-huesos-y-blending-animaciones.md`, secciones 3.2-3.4.
- `docs/adr/0005-verificacion-sin-hardware-dedicado.md` (mismo patron de verificacion sin GPU/entorno grafico).
