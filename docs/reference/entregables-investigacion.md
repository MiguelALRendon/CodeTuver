---
id: ref-entregables-investigacion
title: Entregables de la investigación previa
type: reference
status: current
source: user
last_verified: 2026-08-26
symbols: []
related: [how-to-investigar-integracion-claude-code, how-to-investigar-ventanas-y-modo-pet, how-to-evaluar-avatar-y-licencia, how-to-evaluar-motor-de-voz, exp-por-que-este-orden]
---

# Entregables de la investigación previa

> **Estado: vinculante.** Define qué debe contener la salida de EPIC-001. El *cómo* de cada línea vive en los `how-to/`; los informes se escriben en `docs/research/`.

## Dónde viven

```text
docs/research/claude-code-vtuber-integration.md
docs/research/desktop-window-management.md
docs/research/avatar-and-tts.md
docs/research/experimental-results.md
docs/research/fixtures/
```

## Qué debe incluir cada informe

1. Fuentes consultadas y enlaces.
2. Fecha de consulta.
3. Versión de Claude Code analizada.
4. Versión de Tauri analizada.
5. Sistema operativo y versión utilizados en las pruebas.
6. Capacidades confirmadas.
7. Limitaciones conocidas.
8. Riesgos de compatibilidad.
9. Recomendación de arquitectura.
10. Qué debe probarse localmente.
11. Qué partes pueden implementarse en el MVP.
12. Qué partes deben posponerse.
13. Qué capacidades del modo mascota requieren APIs nativas.
14. Qué fallbacks deben existir.
15. Qué comportamiento no puede garantizarse en todas las plataformas.

## Cómo se clasifica cada hallazgo

Toda afirmación de un informe lleva una de estas etiquetas. **La distinción es el producto**; un informe que las mezcla no sirve.

- Información confirmada por documentación oficial.
- Comportamiento observado experimentalmente.
- Inferencia o hipótesis.
- Funcionalidad no disponible o no garantizada.
- Funcionalidad que requiere integración nativa.
- Funcionalidad que necesita un fallback.

Para las capacidades de ventana, además: garantizada por Tauri · disponible mediante plugins · requiere código Rust específico · requiere APIs nativas del sistema operativo · experimental o no garantizada · debe tener fallback.

**Si una fuente contradice a otra, se documenta la contradicción y se hace una prueba local antes de elegir.** No se resuelve por autoridad de la fuente.

## Lista de cierre de la fase

La implementación completa no arranca hasta producir:

1. Informe de integración con Claude Code.
2. Catálogo de eventos.
3. Catálogo de solicitudes de usuario.
4. Catálogo de formatos de contenido.
5. Diseño del modelo de eventos normalizados.
6. Diseño del modelo de interacción.
7. Diseño del parser de Markdown, ANSI y ASCII.
8. Catálogo de reacciones del avatar.
9. Comparativa de avatares.
10. Análisis de licencias.
11. Matriz de capacidades del avatar.
12. Comparativa de TTS.
13. Informe de capacidades de Tauri y del sistema operativo.
14. Resultados de la prueba de concepto de ventana transparente.
15. Resultados de pruebas experimentales.
16. Arquitectura propuesta.
17. Diseño del `PresentationManager`.
18. Diseño del `DesktopWindowManager`.
19. Plan de implementación por fases.
20. Riesgos y decisiones pendientes.
21. Fallbacks multiplataforma.
22. Criterios de aceptación del modo mascota.

Después se presenta un resumen ejecutivo y **se espera confirmación** antes de hacer cambios arquitectónicos grandes.

## Fixtures

Los ejemplos reales anonimizados van a `docs/research/fixtures/` y se usan para probar el parser, el normalizador, el motor de reacciones y, cuando sea posible, la representación de los estados de presentación.

**No se incluyen secretos, tokens, rutas privadas ni información sensible.**
