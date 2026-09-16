---
id: research-avatar-and-tts
title: Comparativa de avatares, licencias y motores de voz
type: reference
status: current
source: both
last_verified: 2026-08-27
symbols: []
related: [how-to-evaluar-avatar-y-licencia, how-to-evaluar-motor-de-voz, ref-entregables-investigacion, ref-avatar-reacciones-voz]
---

# Comparativa de avatares, licencias y motores de voz

Entregable de FEAT-003 (Hito 3) y FEAT-004 (Hito 4) de `specs/investigacion-previa/plan.md`. Cubre AC-003.1 a AC-003.4 en este documento; la sección de voz la cierra el Hito 4.

**Etiquetas:** [OFICIAL] · [OBSERVADO] · [INFERENCIA] · [NO-DISPONIBLE] · [NATIVO] · [FALLBACK].

## 1-2. Fuentes y fecha de consulta

Búsqueda web real (`WebSearch`/`WebFetch`), 2026-08-27: sitio y licencia oficiales de VRM (`vrm.dev`), repositorio `madjin/vrm-samples`, `opensourceavatars.com` (ToxSam), documentación oficial de Live2D (`live2d.com`, `docs.live2d.com`). Sin descarga real de ningún modelo — este Hito compara licencias y capacidades documentadas, no implementa el renderizador (eso es EPIC-004).

## 3-4. Versiones analizadas

No aplica versión de Claude Code ni de Tauri en este informe.

## Sección de avatar (FEAT-003)

### Barrido de formatos y vías de integración (paso 3.1)

| Formato | Integración web | Integración con Tauri | Control programático | Sincronía con audio | Transparencia/flotante |
|---|---|---|---|---|---|
| **VRM** (VRM 0.x/1.0) | `@pixiv/three-vrm` sobre Three.js/WebGL — es contenido web puro | Funciona sin cambios: el WebView de Tauri (WebView2/Chromium) renderiza WebGL igual que cualquier navegador | Expresiones estándar (`happy`,`angry`,`sad`,`relaxed`,`surprised`,`neutral`), visemas (`aa`,`ih`,`ou`,`ee`,`oh`), huesos para pose/mirada, todo vía la API de `three-vrm` | Visema por amplitud o por fonema (la spec VRM define los cinco visemas base) | Compatible: es un canvas WebGL sobre fondo transparente, igual que cualquier otro elemento web |
| **Live2D** (Cubism) | SDK oficial para Web (`CubismWebSamples`, WebGL) | Igual que VRM — contenido web | Parámetros continuos por model (no un catálogo fijo como VRM; cada modelo define sus propios parámetros de boca/ojos/cejas) | Vía parámetro de apertura de boca, controlable por amplitud | Compatible, mismo mecanismo |
| VRoid (no VRM) | N/A — VRoid Studio exporta a VRM; no es un formato de runtime distinto | — | — | — | — |
| Spine | SDK propio (`spine-ts` para web) | Compatible (contenido web) | Slots/bones, sin estándar de expresión facial predefinido | Depende del rig de cada modelo | Compatible |
| Sprites 2D | Trivial (imagen/spritesheet) | Compatible | Solo lo que el spritesheet defina (limitado) | Ninguna nativa | Compatible |
| Modelos 3D genéricos (glTF sin VRM) | Three.js directo | Compatible | Ninguna convención de expresión facial — hay que definirla a mano por modelo | Ninguna | Compatible |

**garantizada por Tauri:** ninguna de estas — todas dependen de que el contenido sea Web (WebGL/Canvas/DOM), y eso sí lo garantiza el WebView de Tauri sin configuración adicional (mismo mecanismo que ya renderiza el PoC del Hito 2). El propio criterio eliminatorio del how-to ("compatibilidad con ventana transparente") lo cumplen los 5 formatos por igual, porque ninguno depende de una capa nativa distinta de la que ya usa cualquier página web.

### Dónde se buscó (paso 3.2)

VRoid Hub, `opensourceavatars.com`, `madjin/vrm-samples` (GitHub), sitio oficial de Live2D. **No se descargó ni evaluó Booth, itch.io ni Sketchfab en esta pasada** — se declara como cobertura parcial de fuentes, no como ausencia de candidatos ahí (podrían existir más, no se afirma que no).

### Fichas de candidatos (paso 3.3)

```text
Nombre: Avatares CC0 de Open Source Avatars (colección, ToxSam)
URL: https://www.opensourceavatars.com/en
Tipo: Personaje 3D humanoide
Formato: VRM
Autor: ToxSam / comunidad de contribuyentes
Licencia: CC0 (Dominio público), declarada explícitamente por el sitio: "All avatars CC0"
¿Permite uso comercial?: Sí
¿Permite redistribución?: Sí
¿Permite modificación?: Sí
¿Permite uso dentro de una aplicación distribuida?: Sí
¿Permite uso con IA?: Sí (CC0 no restringe el tipo de uso)
Controles faciales disponibles: Estándar VRM — expresiones blendshape (happy/angry/sad/relaxed/surprised/neutral)
Controles de boca: Visemas estándar VRM (aa/ih/ou/ee/oh) — [OFICIAL, spec vrm.dev]
Controles de ojos: Blink + lookAt estándar VRM
Controles de cejas: No estandarizado en VRM (depende del rig del modelo específico; no verificado por modelo individual)
Animaciones disponibles: Depende del modelo — VRM en sí no trae animaciones, solo el esqueleto humanoide sobre el que se animan
API o SDK: `@pixiv/three-vrm` (MIT), sobre Three.js
Compatibilidad con Tauri: Sí — contenido WebGL estándar (confirmado por el mismo mecanismo que el PoC del Hito 2)
Compatibilidad con Vue: Sí — cualquier librería WebGL es agnóstica del framework de UI que la monte
Compatibilidad con ventana transparente: Sí — canvas WebGL sobre fondo transparente
Rendimiento estimado: No medido (no se descargó ni renderizó ningún modelo en este Hito — es fuera de alcance, EPIC-004 lo mide con un modelo real)
Tamaño: No verificado por modelo individual
Riesgos: Ninguno de licencia. Riesgo técnico no verificado: calidad/rigging real de cada modelo de la colección varía, no se auditó modelo por modelo
Atribución requerida: No (CC0)
Veredicto: APTO PARA LA DESCARGA — licencia inequívoca, sin condiciones
```

```text
Nombre: Modelos de muestra de Live2D (ej. "Haru", Cubism 4)
URL: https://www.live2d.com/en/learn/sample/
Tipo: Personaje 2D con rigging por capas (Cubism)
Formato: Live2D (Cubism)
Autor: Live2D Inc.
Licencia: "Free Material License" + "Cubism Sample Data Terms of Use" — permite uso libre en obras comerciales y no comerciales para usuarios individuales o negocios pequeños (< 10 millones de yenes de ingresos anuales)
¿Permite uso comercial?: Sí, para individuos/negocios pequeños bajo el límite de ingresos declarado
¿Permite redistribución?: Ambiguo para este proyecto — el material en sí tiene licencia de uso, pero **publicar** una aplicación construida con el Cubism SDK requiere ADEMÁS un "SDK Release License Agreement" (Publication License Agreement) propio del SDK, no solo del modelo — con pago para negocios sobre el umbral de ingresos. Individuos y negocios pequeños están exentos del pago, pero el acuerdo de licencia de publicación sigue aplicando como obligación legal separada
¿Permite modificación?: Sí, dentro de los términos de la licencia de material
¿Permite uso dentro de una aplicación distribuida?: Condicionado al acuerdo de publicación del SDK — no es un simple "sí"
¿Permite uso con IA?: No especificado en las fuentes consultadas
Controles faciales disponibles: Parámetros continuos definidos por modelo (no hay un catálogo fijo como VRM)
Controles de boca: Parámetro de apertura de boca (`ParamMouthOpenY` es la convención común, no universal)
Controles de ojos: Parámetros de apertura/mirada por modelo
Controles de cejas: Por modelo
Animaciones disponibles: Por modelo (motion files `.motion3.json`)
API o SDK: Cubism SDK for Web (WebGL)
Compatibilidad con Tauri: Sí (contenido web)
Compatibilidad con Vue: Sí
Compatibilidad con ventana transparente: Sí
Rendimiento estimado: No medido
Tamaño: No verificado
Riesgos: **La obligación de licencia de publicación del SDK es una capa legal distinta de la licencia del modelo — no se resuelve solo leyendo la ficha del personaje.** Es una decisión que le corresponde al propietario del proyecto, no una conclusión técnica que este informe pueda cerrar por su cuenta
Atribución requerida: Sí, según Free Material License (no se verificó el texto exacto de atribución en esta pasada)
Veredicto: **AMBIGUO — NO se marca apto para la descarga**, por la regla de este mismo how-to y R9: ningún candidato de licencia ambigua entra al catálogo de la descarga. Válido como candidato de "solo importable por la persona" (quien traiga su propio modelo Live2D con licencia propia, bajo su propia responsabilidad legal), no para bundlearlo en la aplicación gratuita
```

**No se completaron fichas adicionales** (VRoid Hub individual, Spine, Sketchfab) en esta pasada — con un candidato claramente apto (VRM/CC0) y uno claramente no apto para bundling (Live2D), el how-to no exige agotar todas las fuentes una vez que hay una decisión sostenible; ampliar la búsqueda queda como trabajo futuro si el candidato CC0 resulta insuficiente en EPIC-004.

### Qué formatos soportará la importación de personajes propios (paso 3.4, AC-003.2)

Dado que VRM es el formato ganador para el catálogo incluido, y es también el formato de exportación estándar de VRoid Studio (la herramienta más accesible para que una persona cree su propio personaje sin modelar desde cero) y de Live2D (para quien ya tenga un modelo propio con licencia propia): **la importación de personajes propios soporta VRM y Live2D**, delegando en la persona la responsabilidad de la licencia de lo que importa (no es contenido que la aplicación redistribuye, es contenido que la persona trae). Los controles expuestos por FEAT-018 (editor de personajes) se limitan a lo que cada formato realmente expone: expresiones/visemas/huesos estándar para VRM, parámetros específicos del modelo para Live2D.

### Matriz avatar-reacción (paso 3.5)

Contra el catálogo completo de `avatar-reacciones-voz.md` (~80 entradas en 5 ejes), evaluado sobre las capacidades **estándar de VRM** (el formato apto para la descarga):

| Eje | Cobertura con expresión/pose VRM | Fallback donde no alcanza |
|---|---|---|
| **Estado mental** (19 entradas: neutral, concentrada, pensativa, analizando, confundida, dudosa, sorprendida, alarmada, preocupada, cansada, aliviada, satisfecha, entusiasmada, orgullosa, curiosa, impaciente, esperando, dormida, despertando) | Las 6 expresiones estándar VRM (`neutral`,`happy`,`sad`,`angry`,`relaxed`,`surprised`) cubren directamente: neutral→neutral, satisfecha/aliviada/entusiasmada→happy, preocupada/alarmada→sad o surprised según intensidad, sorprendida→surprised. El resto (concentrada, pensativa, analizando, confundida, dudosa, cansada, orgullosa, curiosa, impaciente, esperando, dormida, despertando) **no tiene expresión facial 1:1** — se diferencian por combinación de expresión base + animación de pose/mirada (huesos), no por un blendshape dedicado | Estados sin expresión propia se agrupan en la expresión base más cercana + variación de pose/velocidad de parpadeo/mirada. Es el mecanismo previsto por el propio contrato (`AvatarReactionDefinition.animation` es independiente de `expression`) |
| **Actividad técnica** (18 entradas: leyendo, explorando, buscando, analizando dependencias, planificando, escribiendo código, modificando, eliminando, ejecutando comandos, ejecutando pruebas, compilando, instalando, revisando errores, comparando cambios, generando diff, esperando herramienta, esperando permisos, reintentando, recuperándose de error) | Ninguna de estas es una expresión facial — todas se representan con **animación/pose** (VRM trae el esqueleto humanoide estándar, animable) sobre una expresión base constante (`neutral` o `relaxed`) mientras dura la actividad | Sin pose/animación específica todavía definida por modelo (se define en EPIC-004 al elegir animaciones reales) → fallback: expresión base fija + indicador textual en consola (que ya existe siempre, por `bloques-contenido.md`) |
| **Resultado** (14 entradas: éxito, pruebas exitosas, compilación exitosa, cambio aplicado, advertencia, error recuperable, error grave, comando rechazado, permiso concedido, permiso denegado, sesión cancelada, sesión finalizada, resultado parcial, resultado ambiguo) | Éxito/pruebas exitosas/compilación exitosa/cambio aplicado/permiso concedido → `happy`. Advertencia → expresión neutra + color/icono (presentación, no avatar). Error recuperable/rechazado/denegado → `sad` o `angry` según severidad, con `interruptible: true`. Error grave → `sad`/`angry` sostenido, prioridad alta | Resultado ambiguo/parcial no tiene expresión propia — fallback: `neutral` + la consola/tarjeta de resultado (bloques-contenido.md) es la fuente de verdad, el avatar no carga el peso de comunicar ambigüedad |
| **Interacción con el usuario** (11 entradas: recibiendo instrucción, no entendió, necesita aclaración, esperando respuesta, mostrando opciones, recibiendo respuesta, agradeciendo, confirmando decisión, advirtiendo riesgo, pidiendo permiso, celebrando solución) | Pidiendo permiso/necesita aclaración/mostrando opciones → `confused` o `surprised` + pose de "mirar hacia el panel"; agradeciendo/celebrando → `happy`; advirtiendo riesgo → `sad`/`angry` moderado | Ninguna requiere fallback fuerte — el eje ya está bien cubierto por las 6 expresiones base |
| **Presentación** (18 entradas: parpadeo, respiración, movimiento de cabeza, mirada al panel/chat, señalar tarjeta, notificación, iconos, iluminación, fondo, partículas, efecto de escritura/carga, transición, señal de atención en mascota, burbuja pendiente, animar sin robar foco, reaccionar al clic) | Parpadeo/respiración/mirada/movimiento de cabeza → **nativo de VRM** (blink, lookAt, huesos de cabeza/cuello) [garantizada por el formato]. Señal de atención en modo mascota, burbuja pendiente, animar sin robar foco, reaccionar al clic → son **comportamiento del `PresentationManager`/ventana** (Hito 2), no del avatar — el avatar solo provee la animación visual, no decide cuándo mostrarla | **Iluminación, fondo y partículas NO son capacidades del avatar VRM** — son efectos de escena/postproceso que la app debe implementar en su propio renderizador alrededor del avatar (Three.js lo permite, pero es trabajo de EPIC-004, no algo que el formato VRM traiga incluido). Se declara fallback: estas tres reacciones se implementan como capa separada del renderizador, con `fallback` declarado en `AvatarReactionDefinition` a "sin efecto" si el renderizador no las soporta aún |

**Conclusión de la matriz:** VRM cubre de forma nativa y directa el eje de Presentación (parpadeo/mirada/pose) y da una base de 6 expresiones para los otros cuatro ejes, pero el catálogo de ~80 reacciones **nunca fue diseñado para tener un blendshape dedicado por entrada** — el propio contrato ya lo anticipa separando `expression` de `animation` y `state`. Ningún hallazgo de esta matriz invalida el contrato; lo confirma.

### Si ningún candidato resulta apto (paso 3.6)

**No aplica completamente** — sí hay un candidato apto para la descarga (VRM/CC0, `opensourceavatars.com`). Pero el Hito 2 de este mismo plan **ya implementó, sin saberlo como decisión formal, un avatar de prueba claramente reemplazable**: un círculo CSS sobre `constants.css`, sin ninguna dependencia de VRM/Live2D. Se declara aquí, retroactivamente, que ese es el avatar de prueba que este how-to pide en su §5, y que satisface la restricción de reemplazabilidad: no toca el motor de eventos, el chat, el TTS, la consola ni la presentación — es un `<div>` en `App.vue`. El avatar VRM real se integra en FEAT-015 (EPIC-004), reemplazando ese círculo sin tocar ninguna otra capa.

## 8. Riesgos de compatibilidad (avatar)

- La obligación de licencia de publicación del SDK de Live2D es un riesgo legal, no técnico — debe decidirlo el propietario del proyecto antes de EPIC-004 si algún día quiere ofrecer Live2D como opción de importación con soporte oficial, no solo "trae tu propio archivo bajo tu responsabilidad".
- Ningún modelo VRM individual de la colección CC0 fue descargado ni auditado por calidad/rigging en este Hito — es un riesgo de calidad, no de licencia, y se pospone a EPIC-004.

## 9-15. Recomendación, qué probar, MVP, posponer, modo mascota, fallbacks, multiplataforma

- **Recomendación:** usar VRM + `@pixiv/three-vrm` como formato del catálogo incluido; permitir importación de VRM y Live2D para personajes propios.
- **Probar localmente antes de EPIC-004:** descargar y renderizar al menos un modelo real de `opensourceavatars.com` dentro de un canvas Three.js en el propio Tauri, medir rendimiento real (no medido aquí).
- **MVP:** el círculo de prueba del Hito 2 basta hasta EPIC-004 (según el propio how-to, punto 13 del MVP: "documentar claramente por qué una capacidad no puede incluirse todavía" cuenta como entregable cumplido para lo relacionado al modo mascota; aquí aplica el mismo principio al avatar real).
- **Posponer:** todo el rigging/animación real, blendshapes por modelo específico, iluminación/partículas de escena.
- **Modo mascota:** requiere que el renderizador WebGL siga funcionando sobre ventana transparente con click-through — ya confirmado como viable en el Hito 2 (mismo mecanismo, sin verificación pixel-perfecta de click-through, ver ese informe).
- **Fallbacks:** declarados por eje en la matriz de arriba.
- **Multiplataforma:** todo lo de avatar es contenido web (WebGL) — a diferencia de la ventana (Hito 2), esta parte SÍ debería comportarse igual en macOS/Linux, aunque no se verificó (fuera de alcance, sin esas plataformas disponibles).

## Sección de voz (FEAT-004, Hito 4)

### Comparativa de las cinco familias (paso 4.1)

| Familia | Licencia | Privacidad | Sin conexión | Latencia | Streaming | Volumen/velocidad | Eventos | **Acceso a amplitud** | Fonemas/visemas | Windows | Modo mascota |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Web Speech API** (`speechSynthesis`, nativa del navegador/WebView) | Ninguna — no redistribuye ningún asset, usa las voces del sistema operativo vía el motor del navegador | Depende del navegador: en Chromium/Edge (WebView2) las voces locales del SO se procesan en el dispositivo; no se verificó si alguna voz remota de Google se usa por defecto en este entorno | Sí, con voces locales del SO (SAPI en Windows) | Baja (llamada local) | No aplica — es un servicio de "hablar", no un flujo de audio que la app reciba | `rate`, `pitch`, `volume` — controles nativos de la API | `start`, `end`, `pause`, `resume`, `boundary` (límite de palabra/carácter), `error` — todos oficiales | **NO disponible** — confirmado: la API no expone el audio sintetizado como nodo conectable a `AnalyserNode`; el motor de síntesis vive fuera del grafo de Web Audio [OFICIAL] | No expone fonemas ni visemas; el evento `boundary` da tiempo de palabra/carácter, no fonema | Sí — usa las voces SAPI instaladas en Windows | Requiere que la app decida cuándo llamar `speak()`, no hay notificación nativa que "robe foco" — el control de intrusividad es responsabilidad de la app, no del motor |
| **Motores nativos del sistema (SAPI directo vía Rust)** | Igual que arriba, sin redistribuir voces | Local | Sí | Baja | Si se implementa vía FFI, se podría obtener el buffer de audio crudo | Nativo | Depende del binding elegido | **Sí, potencialmente** — si se accede al motor SAPI directamente (no vía el navegador) se puede interceptar el buffer PCM y calcular amplitud real | Requeriría trabajo adicional de Rust específico | Sí | Igual, control de la app |
| **TTS local (modelo neuronal on-device, ej. Piper, Coqui)** | Varía por proyecto — hay opciones open source (Piper es MIT), a verificar por voz específica antes de incorporar una | Total — no sale de la máquina | Sí | Media (inferencia local) | Sí, produce un buffer/archivo de audio real | Total (se reproduce con `<audio>`/Web Audio) | Todos los eventos de un elemento `<audio>` estándar | **Sí** — al ser un buffer de audio real, se conecta directo a un `AnalyserNode` de Web Audio para amplitud real | Algunos proyectos (ej. Piper) no dan fonemas directos, pero el audio real permite análisis de amplitud fiable | Sí, requiere empaquetar el modelo (aumenta tamaño de descarga) | Control total de la app |
| **TTS remoto (API en la nube, ej. ElevenLabs, Azure TTS)** | Comercial, de pago o con cuota gratuita limitada — requiere licencia de uso de API, no de redistribución de asset | Envía texto a un tercero — no aplica a este proyecto sin consentimiento explícito | No — requiere conexión | Alta (round-trip de red) | Sí, streaming de audio real | Total | Eventos de red + audio | **Sí**, mismo mecanismo que TTS local (audio real) | Algunos proveedores sí dan visemas/marcas de tiempo por fonema (ElevenLabs, Azure) | Sí | Requiere manejo de fallo de red sin romper el modo mascota |
| **Proveedores comerciales embebidos en el binario** | Requiere licencia comercial explícita, cuota o pago — **no compatible con "aplicación gratuita" sin ese costo asumido por alguien** | Variable | Variable | Variable | Variable | Variable | Variable | Variable | Variable | Sí | Variable |

**garantizada por Tauri:** ninguna directamente — todas las familias son contenido/API web o del sistema operativo, accesibles porque el WebView es Chromium (mismo principio que el avatar).

### Sincronización de boca (paso 4.2, AC-004.2)

**Hallazgo central, con impacto directo en la arquitectura:** la opción con mejor perfil de licencia y la más simple de integrar (**Web Speech API**) **no expone amplitud de audio** — es una limitación real y confirmada de la API, no de esta implementación. Esto obliga a una decisión que el how-to no anticipaba como "elegir amplitud porque es lo simple":

- **Implementación inicial recomendada:** Web Speech API para el habla (sin costo, sin licencia, funciona offline con las voces de Windows), con la boca sincronizada por el evento `boundary` (marca de tiempo por palabra) en vez de amplitud real — un movimiento de boca por palabra/sílaba estimada, no una forma de onda real. Es una aproximación deliberadamente más simple que "amplitud", no una implementación parcial de amplitud.
- **La interfaz `TextToSpeech` debe abstraer esto** para que sustituirlo por un motor con audio real (TTS local, la vía que sí da amplitud) sea posible sin rehacer el resto — exactamente lo que el contrato ya exige. **Se añade una nota al contrato** (abajo) aclarando que "amplitud" en la implementación inicial es en realidad "eventos de límite de palabra", con la migración a amplitud real declarada como upgrade path, no como implementación actual.

### Comportamiento resuelto (paso 4.3, AC-004.3)

| Comportamiento | Cómo se resuelve |
|---|---|
| No bloquear la sesión | `speechSynthesis.speak()` es asíncrono por diseño; Claude sigue corriendo en su propio transporte, independiente del habla |
| Cancelar una frase en curso | `speechSynthesis.cancel()` — oficial |
| Varias frases en cola | `speechSynthesis` ya mantiene una cola FIFO internamente al llamar `speak()` varias veces; la política de cola de `TextToSpeech` decide si usar esa cola nativa o gestionar la propia (recomendado: cola propia con límite, para poder descartar mensajes obsoletos — ver siguiente punto) |
| No hablar mensajes duplicados | Responsabilidad del motor de personalidad (`avatar-reacciones-voz.md`), no del TTS — el TTS solo reproduce lo que se le pasa; la deduplicación vive en la capa de reacciones, ya contemplada en ese contrato |
| Respetar accesibilidad del sistema | Windows expone preferencias de voz/velocidad en la configuración de accesibilidad — la app debe leer la voz/velocidad por defecto del sistema en vez de imponer una propia, y respetar `prefers-reduced-motion` para la animación de boca asociada (no para el audio en sí) |
| No ser intrusivo en modo mascota | La app decide cuándo llamar `speak()` — se ata a la misma regla de `avatar-reacciones-voz.md` de que la voz es opcional y configurable, y a la de `presentacion-y-ventana.md` de que la mascota no roba foco: hablar no requiere foco de ventana, así que no lo compromete |

### Licencia y atribución de voces candidatas (paso 4.4)

Web Speech API no incorpora ninguna voz al binario — usa las ya instaladas en el sistema operativo de la persona. **No hay atribución que registrar** porque no hay redistribución de ningún asset de voz. Si en el futuro se incorpora TTS local (Piper u otro), su licencia se evalúa en ese momento, antes de empaquetar el modelo — no se pre-aprueba aquí sin conocer la voz específica.

### `TextToSpeech` concretado (paso 4.5)

```typescript
interface TextToSpeech {
  speak(text: string): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
}
```

Sin cambios sobre el contrato ya escrito — se confirma tal cual. **Nota de implementación (no cambia la interfaz):** la política de cola es propia de la app (cola con límite y descarte de mensajes obsoletos), no la cola nativa de `speechSynthesis`, para poder aplicar la regla de "no mensajes duplicados/obsoletos" del motor de personalidad. La sincronización de boca **no es parte de esta interfaz** — vive en el `AvatarController` (`avatar-reacciones-voz.md`), que consume eventos de `boundary` (implementación inicial) o de amplitud real (upgrade futuro) para animar la boca, desacoplado de si el habla en sí se reprodujo con éxito.

## Contrato actualizado

`avatar-reacciones-voz.md` pasa a `status: current` — ambas secciones (avatar y voz) están confirmadas por este Hito. La nota sobre `boundary` vs. amplitud real se agrega directamente en ese documento, sección "Sincronización de boca".

## Integración real (Hito 8 de `presencia-vtuber`, reapertura 2026-08-29)

El punto pendiente de §9-15 ("Probar localmente antes de EPIC-004: descargar y renderizar al menos un modelo real... medir rendimiento real") se ejecutó parcialmente: **Rabbit** y **Polydancer** (colección `100Avatars`, ver `character-catalog.ts`) se integraron con `three`+`@pixiv/three-vrm` reales, reemplazando el círculo de prueba. `vue-tsc`/`vite build`/suite de pruebas confirman que ambos `.vrm` se resuelven y sirven como asset real (2.63 MB y 1.24 MB respectivamente).

**Lo que sigue sin medirse** (mismo tipo de brecha que otras verificaciones de hardware/interactivas de este proyecto, ver `docs/adr/0005-verificacion-sin-hardware-dedicado.md`): FPS y consumo de memoria reales del renderizador WebGL dentro de una ventana Tauri en vivo — este entorno no tiene forma de abrir `npm run dev`/Tauri y observar un canvas interactivo. Declarado como pendiente, no asumido.

**Corrección de licencia (no anticipada al escribir este informe):** el candidato original evaluado aquí era la colección CC0 de `opensourceavatars.com`/ToxSam en términos generales. Los dos modelos finalmente elegidos por el usuario (Rabbit #059, Polydancer #021) resultaron pertenecer a la colección `100Avatars` de `PolygonalMind`, cuyo repositorio de origen **no tiene archivo LICENSE propio** (404 en la API de licencias de GitHub, issue `PolygonalMind/100Avatars#2` sin resolver desde 2021) — la etiqueta CC0 la declara el agregador `ToxSam/open-source-avatars`, no el propio autor. Riesgo de licencia aceptado explícitamente por el usuario (ver `specs/presencia-vtuber/plan.md`, paso 8.1); documentado también en `character-catalog.ts` y visible en la UI (`CharacterSelector.vue`).
