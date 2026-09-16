---
id: exp-guia-visual
title: Dirección visual y qué debe definir la guía
type: explanation
status: current
source: user
last_verified: 2026-08-26
symbols: []
related: [ref-avatar-reacciones-voz, ref-bloques-contenido, ref-presentacion-y-ventana]
---

# Dirección visual y qué debe definir la guía

Cubre el contexto de **FEAT-005**. La guía visual concreta —con sus tokens— es entregable de esa Feature; este documento fija la intención y el listado de lo que no puede quedar sin decidir.

> **La guía concreta ya existe:** [`reference/guia-visual.md`](../reference/guia-visual.md) (Hito 5 de `investigacion-previa`, cerrado 2026-08-27) — paleta, tipografía, componentes, adaptación por modo y contraste medido.

## La intención

Debe sentirse **moderno, elegante y dinámico**. Como una aplicación de escritorio de personaje o VTuber.

**No** como una aplicación empresarial genérica.

## Referencias a estudiar

VTuber companion · anime desktop assistant · interfaz de novela visual · registro de misiones de RPG · terminal futurista · HUD de anime · consola holográfica · chat con personaje · panel de misión · sistema de afinidad o estado emocional.

> Sobre el último: se estudia como **referencia visual**, no como mecánica. Un juego de afinidad o de niveles obligatorio está explícitamente fuera de alcance (`02_entendimiento.md` §6).

## Qué debe definir la guía antes de implementar

**Fundamentos** — paleta de colores · tipografías · bordes · sombras · transparencias · animaciones · jerarquía visual.

**Componentes** — estados de éxito y error · diseño de tarjetas · de notificaciones · de solicitudes de permiso · de código y diffs · de la consola · de mensajes largos.

**Adaptación** — diseño responsive para distintos tamaños de ventana · diferencias visuales entre modo completo, compañera y mascota · indicadores de atención para el modo mascota · estados visuales cuando la ventana no puede recibir foco.

**Accesibilidad** — contraste · reducción de movimiento · modo oscuro y posibles temas.

## El límite que la estética no cruza

**La estética anime no sacrifica legibilidad, especialmente en código, errores, comandos y permisos.**

Esa frase es la versión visual del principio de fidelidad: la presentación bonita nunca oculta ni altera información técnica relevante. Un permiso que se lee mal es un permiso que se concede mal.

Los efectos visuales sobre mensajes importantes se mantienen **moderados**, y los controles de presentación son claros, accesibles y nunca se ocultan de forma que la interfaz no pueda recuperarse.

## Cómo se hace cumplir

No por buena voluntad. El proyecto está en modo **theme-first**: ningún valor de identidad visual —color, tamaño, radio, tipografía, sombra— se escribe quemado; todo sale de tokens en `src/assets/styles/constants.css`. Lo bloquea la etapa `theme-check` del guantelete.

Es decir: la guía visual de FEAT-005 no termina en un documento, termina en un archivo de tokens.
