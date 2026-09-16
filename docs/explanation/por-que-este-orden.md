---
id: exp-por-que-este-orden
title: Por qué la integración va antes que la pantalla
type: explanation
status: current
source: user
last_verified: 2026-08-26
symbols: []
related: [ref-entregables-investigacion, exp-capa-de-presentacion, how-to-investigar-ventanas-y-modo-pet]
---

# Por qué la integración va antes que la pantalla

> **Este documento explica el razonamiento, no es el plan.** Cuando `/workflow-plan` genere `flujo_projects/codetuver-avatar/05_plan.md`, ese será el plan vigente y este documento explica por qué tiene la forma que tiene. Si se contradicen, manda el plan.

## Los dos errores que este orden evita

**Construir la pantalla antes que la integración real.** Es el riesgo 10 de `02_entendimiento.md`: se llega a una aplicación vistosa que no refleja el trabajo verdadero del agente. Una maqueta bonita con datos falsos parece un avance enorme y no lo es, porque el trabajo difícil —entender qué emite realmente Claude Code— sigue intacto.

**Construir una ventana transparente sin haber comprobado sus limitaciones.** Es el riesgo 2. El modo mascota depende de capacidades que Windows puede no garantizar de forma estable, y descubrirlo con el modo ya construido significa tirarlo.

De ahí la regla: primero se investiga, después se implementa, y dentro de la implementación va antes lo que sostiene a lo demás.

## Antes de programar

1. Inspeccionar el repositorio actual y determinar si ya existe un proyecto Tauri/Vue.
2. Analizar la estructura existente.
3. Investigar la forma correcta y actual de integrar Claude Code.
4. Investigar las capacidades reales de Tauri y del sistema operativo para la gestión de ventanas.
5. Identificar qué información puede recibirse en tiempo real.
6. Determinar qué partes requieren parsing y cuáles pueden obtenerse estructuradamente.
7. Identificar qué capacidades del modo mascota son multiplataforma y cuáles requieren código específico de Windows.
8. Construir una prueba de concepto mínima de ventana transparente.
9. Comprobar foco, click-through, posición, restauración y múltiples monitores.
10. Documentar las limitaciones encontradas.
11. Proponer una arquitectura concreta y explicar las decisiones importantes.

**No destruyas código existente sin entenderlo. No reestructures el proyecto innecesariamente.** Si aparece una decisión arquitectónica que puede afectar seriamente la compatibilidad futura, detente y explícala antes de continuar.

## El MVP

El primer objetivo **no** es el VTuber perfecto ni la mascota con todas las capacidades. Es que este flujo funcione de punta a punta:

```text
Usuario → Interfaz → Claude Code real → eventos/salida → Event Normalizer
                                                              ↓
                               ┌──────────┬──────────┬────────────────┐
                               ▼          ▼          ▼                ▼
                            Consola     Chat      Avatar     Estado de presentación
```

El MVP debe poder:

1. Iniciar Claude Code.
2. Seleccionar un directorio de trabajo.
3. Enviar instrucciones.
4. Recibir salida en tiempo real.
5. Mostrar la salida cruda.
6. Mostrar actividad normalizada.
7. Mostrar respuestas en el chat.
8. Hacer reaccionar un avatar básico a los eventos.
9. Manejar errores sin matar la sesión.
10. Mantener separadas las capas de Claude, eventos, UI, avatar y voz.
11. Cambiar entre modo completo y modo compañera sin afectar la sesión.
12. Mantener eventos e interacciones pendientes al ocultar el chat o la actividad.
13. Probar una implementación mínima del modo mascota **o documentar claramente por qué una capacidad no puede incluirse todavía**.
14. Restaurar la interfaz completa desde el modo mascota cuando la plataforma lo permita.
15. Mostrar una señal clara cuando Claude requiera interacción.

El punto 13 es deliberado: para el modo mascota, un «no se puede todavía, y esta es la razón» cuenta como entregable cumplido. Para los otros catorce, no.

**Después** del MVP: animaciones avanzadas · Live2D u otro sistema VTuber · TTS · sincronización de boca · personalidad · temas · ventana flotante · modo mascota completo · click-through avanzado · historial · persistencia avanzada · pulido visual.

## El orden de implementación

Una vez aprobada la investigación:

1. Transporte real con Claude Code.
2. Captura de salida cruda.
3. Registro y persistencia temporal de eventos.
4. Normalizador de eventos.
5. Modelo de solicitudes de usuario.
6. Interfaz de permisos, opciones y formularios.
7. Parser incremental de contenido.
8. Visor de salida cruda.
9. Visor de consola personalizada.
10. Chat.
11. Renderizador semántico orientado a la estética anime.
12. Motor de reacciones.
13. Avatar de prueba.
14. Integración con el avatar seleccionado.
15. TTS.
16. Sincronización labial.
17. Investigación y prueba de concepto de gestión de ventanas.
18. Abstracción `DesktopWindowManager`.
19. `PresentationManager` y máquina de estados.
20. Modo completo.
21. Modo compañera.
22. Modo mascota con fallback seguro.
23. Indicadores de atención e interacciones pendientes.
24. Animaciones avanzadas.
25. Pulido visual.
26. Pruebas de compatibilidad.
27. Documentación de instalación, licencias y distribución.

Léelo de abajo hacia arriba y se ve la lógica: lo último que se hace es lo que más se ve.

> **Nota de alcance:** esta lista es anterior a tres ampliaciones registradas en `02_entendimiento.md` §15 —catálogo, importación y editor de personajes (FEAT-016 a 018), menú visual de comandos (FEAT-031) y panel de plugins, servidores MCP y ajustes (FEAT-032)—. No aparecen aquí porque no existían cuando se escribió. El alcance vigente es el de `03_requerimientos.md`.

## La prioridad, en una frase

Que la aplicación represente **fielmente** el comportamiento real de Claude Code —sus peticiones de interacción, errores, formatos de salida y estados intermedios— y que pueda presentar ese estado de forma segura en los tres modos.
