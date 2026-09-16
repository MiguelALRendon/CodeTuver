---
id: how-to-evaluar-motor-de-voz
title: Evaluar un motor de voz y la sincronización de boca
type: how-to
status: current
source: user
last_verified: 2026-08-26
symbols: []
related: [ref-avatar-reacciones-voz, ref-entregables-investigacion]
---

# Evaluar un motor de voz y la sincronización de boca

Cubre **FEAT-004**. Salida: la parte de voz de `docs/research/avatar-and-tts.md`.

## 1. Opciones a comparar

Web Speech API · motores nativos del sistema · TTS local · TTS remoto · proveedores comerciales.

Para cada uno: licencia · privacidad · uso sin conexión · latencia · streaming de audio · control de volumen y velocidad · eventos de inicio, pausa y finalización · **acceso a amplitud** · fonemas o visemas · compatibilidad con Windows, macOS y Linux · comportamiento en modo mascota · posibilidad de emitir notificaciones sin robar el foco.

Como la aplicación se publica gratis, una voz **incorporada al producto** necesita licencia de redistribución con su atribución documentada.

## 2. Sincronización de boca

Averigua cómo obtener amplitud de audio, cómo sincronizar la boca con ese audio, y cómo detectar fonemas.

La implementación inicial puede usar **amplitud**, pero la interfaz debe permitir sustituirla después por fonemas o visemas sin rehacer el resto.

## 3. Comportamiento que hay que resolver

- Cómo evitar que el TTS **bloquee la sesión**.
- Cómo cancelar una frase en curso.
- Cómo manejar varias frases en cola.
- Cómo evitar hablar mensajes duplicados.
- Cómo respetar la configuración de accesibilidad del sistema.
- Cómo evitar que el audio sea inesperadamente intrusivo en modo mascota.

Los dos últimos no son detalles de pulido: una compañera de escritorio que habla cuando no debe se apaga y no se vuelve a encender.

## 4. Cerrar

Con el motor elegido, concreta la abstracción `TextToSpeech` y su política de cola en [Avatar, reacciones y voz](../reference/avatar-reacciones-voz.md).

Recuerda la regla que gobierna todo esto: **la voz habla solo cuando el motor de personalidad lo decide**, no en cada acción técnica. La consola muestra todo; la voz, no.
