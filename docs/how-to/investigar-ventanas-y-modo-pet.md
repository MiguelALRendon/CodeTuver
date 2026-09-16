---
id: how-to-investigar-ventanas-y-modo-pet
title: Investigar la gestión de ventanas y validar el modo mascota
type: how-to
status: current
source: user
last_verified: 2026-08-26
symbols: []
related: [ref-presentacion-y-ventana, ref-entregables-investigacion, ref-taxonomia-errores]
---

# Investigar la gestión de ventanas y validar el modo mascota

Cubre **FEAT-002**. Salida: `docs/research/desktop-window-management.md` y la parte de ventana de `docs/research/experimental-results.md`.

> **Investígalo por separado de la integración con Claude Code.** Son dos problemas distintos y mezclarlos oculta cuál de los dos falla.
>
> **No des por hecho que una ventana transparente hecha en Vue se comportará como una mascota de escritorio real.** Este requisito no se resuelve improvisando desde el frontend.

## 1. Qué averiguar de Tauri, Rust y Windows

**Forma de la ventana** — ventanas sin bordes · transparencia real · fondos transparentes · transparencia por píxel · diferencia entre ventana transparente y ventana con fondo semitransparente · siempre encima.

**Posición y pantalla** — posicionamiento absoluto · relativo al escritorio · múltiples monitores · cómo se calcula el área de trabajo excluyendo la barra de tareas · DPI y escalado · monitores de distinta densidad.

**Foco y ratón** — foco de ventana · activación y desactivación · qué significa realmente ignorar eventos de ratón · click-through · click-through **solo en regiones transparentes** · captura del clic **únicamente sobre el avatar**.

**Ciclo de la ventana** — restauración · minimización · maximización · cambio dinámico de tamaño y de posición.

**Convivencia con el escritorio** — Alt+Tab · barra de tareas · cambio de aplicación · ventanas maximizadas · aplicaciones a pantalla completa · bloqueo y desbloqueo de Windows · suspensión y reanudación · escritorios virtuales · escritorios remotos · desconexión del monitor donde estaba la mascota · cambio de escala del monitor.

**Rendimiento y accesibilidad** — aceleración gráfica · rendimiento de una ventana transparente con avatar animado · consumo de memoria y GPU · accesibilidad y reducción de movimiento.

## 2. Clasificar cada capacidad

Cada hallazgo va etiquetado como: garantizada por Tauri · disponible mediante plugins · requiere código Rust específico · requiere APIs nativas del sistema operativo · experimental o no garantizada · debe tener fallback.

**Qué fallback usar si la transparencia o el click-through no funcionan es parte del entregable, no una nota al pie.**

## 3. Prueba de concepto mínima

Constrúyela **antes** de integrar el modo mascota:

1. Ventana sin bordes.
2. Fondo transparente.
3. Avatar de prueba.
4. Posicionamiento en una esquina.
5. Siempre encima.
6. Cambio de tamaño.
7. Cambio de posición.
8. Restauración al hacer clic.
9. Prueba de foco.
10. Prueba de click-through.
11. Prueba con múltiples monitores.
12. Prueba con distintos factores de escala.
13. Prueba al cambiar de aplicación.
14. Prueba al bloquear y desbloquear el sistema.

## 4. Pruebas de escritorio completas

Sobre la prueba de concepto, comprueba y **documenta los resultados reales, no las expectativas**:

Ventana sin bordes · transparencia real · fondo transparente · siempre encima · posicionamiento en cada esquina · posicionamiento en múltiples monitores · DPI y escalado · cambio de tamaño · cambio de posición · pérdida y recuperación del foco · click-through · captura de clic sobre el avatar · restauración al hacer clic · Alt+Tab · barra de tareas · cambio de aplicación · aplicaciones a pantalla completa · bloqueo y desbloqueo de Windows · suspensión y reanudación · desconexión de un monitor · cambio de escritorio virtual · **fallo de una capacidad nativa** · **recuperación desde un estado de ventana inconsistente** · rendimiento con avatar animado · consumo de memoria y GPU.

Los dos en negrita importan más de lo que parecen: son los que evitan dejar una ventana invisible o inaccesible — ver [Taxonomía de errores](../reference/taxonomia-errores.md).

## 5. Cerrar

Si el modo mascota tal como está descrito no se sostiene, **cambia el modo mascota, no el stack**. Declara la alternativa documentada y usable, y actualiza los criterios de aceptación del modo en `03_requerimientos.md` vía `/workflow-update-docs`.
