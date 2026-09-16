---
id: how-to-evaluar-avatar-y-licencia
title: Evaluar un avatar candidato y su licencia
type: how-to
status: current
source: user
last_verified: 2026-08-26
symbols: []
related: [ref-avatar-reacciones-voz, ref-entregables-investigacion]
---

# Evaluar un avatar candidato y su licencia

Cubre **FEAT-003**. Salida: la parte de avatar de `docs/research/avatar-and-tts.md`.

> **No descargues ni integres un avatar únicamente porque visualmente sea atractivo. No descargues contenido con licencia ambigua.**
>
> La aplicación se publica gratis, así que cada personaje **incluido en la descarga** necesita licencia que permita redistribuirlo dentro de una aplicación publicada, con su atribución documentada.

## 1. Formatos y sistemas a considerar

Live2D · VRM · VRoid · Spine · sprites 2D · modelos 3D.

Y por su integración: integración web · integración con Tauri · control programático de expresiones, animaciones, boca, ojos, cejas, poses y estados · sincronización con audio · soporte de transparencia y ventana flotante.

## 2. Dónde buscar

Tiendas y comunidades de modelos Live2D · VRoid Hub · Booth · itch.io · Sketchfab · GitHub · repositorios de modelos libres · sitios de assets con licencias explícitas.

Documentación de referencia: Live2D Cubism · VRM · PixiJS, Three.js u otros renderizadores relevantes · sistemas de avatar web o de escritorio con API pública.

**Que un modelo aparezca en una de estas fuentes no implica que pueda redistribuirse.** La licencia se lee una por una.

## 3. Ficha por candidato

```text
Nombre:
URL:
Tipo:
Formato:
Autor:
Licencia:
¿Permite uso comercial?:
¿Permite redistribución?:
¿Permite modificación?:
¿Permite uso dentro de una aplicación distribuida?:
¿Permite uso con IA?:
Controles faciales disponibles:
Controles de boca:
Controles de ojos:
Controles de cejas:
Animaciones disponibles:
API o SDK:
Compatibilidad con Tauri:
Compatibilidad con Vue:
Compatibilidad con ventana transparente:
Rendimiento estimado:
Tamaño:
Riesgos:
Atribución requerida:
Veredicto:
```

La ficha separa dos usos distintos: los personajes que pueden **incluirse en la descarga** y los que solo la propia persona puede **importar en su equipo**. Un modelo puede servir para lo segundo y no para lo primero.

## 4. Cruzar con las reacciones

Con el avatar elegido, construye la [matriz avatar-reacción](../reference/avatar-reacciones-voz.md#matriz-avatar-reacción): qué reacción del catálogo puede ejecutarse realmente, con qué controles, y si puede mostrarse correctamente en modo mascota.

**Si una reacción no es compatible, define un fallback visual. No diseñes reacciones que el sistema no pueda ejecutar.**

## 5. Si no aparece nada adecuado

Implementa un avatar de prueba **claramente reemplazable**: SVG, sprite animado, personaje original del proyecto, o modelo de demostración con licencia compatible.

La arquitectura debe permitir cambiar de avatar sin tocar el motor de eventos, el chat, el TTS, la consola ni el sistema de presentación.
