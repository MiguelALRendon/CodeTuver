---
id: ref-taxonomia-errores
title: Taxonomía de errores y aislamiento de fallas
type: reference
status: current
source: user
last_verified: 2026-08-26
symbols: []
related: [exp-no-depender-de-texto-fragil, ref-presentacion-y-ventana]
---

# Taxonomía de errores y aislamiento de fallas

> **Estado: vinculante.** A diferencia de los modelos de datos, estas reglas no esperan a la investigación. Son la garantía de que la aplicación no pueda matar la sesión que presenta.

## Clases de error a distinguir

La aplicación no trata todos los fallos igual. Distingue:

| Origen | Clases |
|---|---|
| Agente | Error de Claude Code · error del proceso · error de comunicación |
| Interpretación | Error de parsing |
| Presencia | Error de TTS · error de avatar |
| Interfaz | Error de interfaz |
| Escritorio | Error de gestión de ventana · capacidad no soportada por la plataforma · error al cambiar de modo · error al restaurar la ventana · error al obtener monitores o áreas de trabajo |

## Reglas de aislamiento

Cada una responde a un fallo concreto que no debe propagarse:

- Un fallo del **avatar** no mata la sesión de Claude.
- Un fallo del **TTS** no detiene Claude.
- Un fallo del **parser** no impide mostrar la salida cruda.
- Un fallo de la **ventana en modo mascota** no detiene Claude ni pierde eventos.

## Protocolo ante un fallo de transición de presentación

Si una transición de modo falla, la aplicación debe, en este orden:

1. Registrar el error.
2. Mantener la sesión de Claude activa.
3. Intentar restaurar un modo seguro.
4. Informar a la persona.
5. Conservar las interacciones pendientes.
6. **Evitar dejar una ventana invisible o inaccesible.**

El punto 6 es el que convierte un fallo molesto en uno que obliga a matar el proceso desde el administrador de tareas. Los controles de presentación nunca deben poder ocultarse de forma que la interfaz no se pueda recuperar.
