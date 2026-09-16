# Proyecto: VTuber Desktop para Claude Code

Quiero construir una aplicación de escritorio que funcione como una interfaz visual, animada y configurable para Claude Code.

La aplicación debe conservar a Claude Code como agente real y limitarse a proporcionar una capa de presentación, interacción, visualización y gestión de ventana. La misma sesión de Claude Code debe poder mostrarse mediante una interfaz completa, una vista de compañera o una mascota de escritorio, sin detener, duplicar, reiniciar ni alterar innecesariamente el proceso subyacente.

## Objetivo principal

La aplicación NO debe reemplazar ni reimplementar el agente de Claude Code.

Claude Code debe seguir siendo el cerebro y ejecutarse realmente como proceso. La aplicación debe funcionar como una capa de presentación e interacción encima de él.

La experiencia final debe sentirse como una aplicación de escritorio tipo VTuber:

- Un avatar VTuber visible.
- El avatar reacciona en tiempo real a lo que Claude Code está haciendo.
- Al hacer clic en el avatar se abre o interactúa con una interfaz de chat.
- El usuario puede escribir instrucciones para Claude Code.
- Claude Code procesa esas instrucciones normalmente.
- La aplicación muestra en tiempo real una representación visual clara y atractiva de lo que Claude Code está haciendo.
- Debe existir un visor de la consola real de Claude Code, pero NO como una ventana externa de PowerShell, CMD o terminal.
- La consola debe representarse dentro de nuestra propia interfaz con un diseño personalizado.
- Debe existir una opción para inspeccionar la salida original y cruda cuando sea necesario.
- La VTuber puede hablar mediante Text-to-Speech.
- La boca y las expresiones del avatar deben reaccionar a la voz y a los eventos.
- La aplicación debe sentirse como una compañera de escritorio, no como un simple cliente de chat.
- La misma sesión debe poder cambiar de presentación sin perder eventos ni estado.

---

# Stack

Usa:

- Tauri.
- Rust para el backend.
- Vue 3.
- TypeScript.
- Vite.

Utiliza una arquitectura limpia y modular.

No introduzcas frameworks innecesarios sin justificarlo.

La gestión de ventanas debe estar aislada de la lógica de Claude Code, del motor de reacciones, del avatar, del TTS, del chat y de la consola.

---

# PRINCIPIO ARQUITECTÓNICO FUNDAMENTAL

Claude Code es el agente real.

NO implementes otro agente LLM.

NO intentes reproducir el razonamiento de Claude.

NO simules las respuestas de Claude.

NO construyas una implementación alternativa de Claude Code.

La aplicación debe lanzar y comunicarse con el proceso real de Claude Code.

Conceptualmente:

```text
Vue UI
   │
   ▼
Tauri / Rust
   │
   ▼
Claude Code process
   │
   ├── stdin
   ├── stdout
   └── stderr
```

La aplicación debe poder:

1. Iniciar una sesión de Claude Code.
2. Enviar mensajes e instrucciones.
3. Recibir su salida en tiempo real.
4. Detectar eventos relevantes.
5. Representarlos visualmente.
6. Mantener disponible la salida cruda.
7. Mostrar solicitudes de interacción pendientes.
8. Cambiar de modo de presentación sin afectar la sesión.
9. Restaurar la interfaz completa cuando el usuario interactúe con la mascota de escritorio.

---

# IMPORTANTE: NO DEPENDER DE TEXTO FRÁGIL

No diseñes toda la aplicación suponiendo que determinadas frases exactas de la consola de Claude Code permanecerán iguales para siempre.

Investiga primero qué mecanismos de integración, eventos, formatos estructurados o interfaces de salida ofrece actualmente Claude Code.

Prioriza:

1. APIs y eventos estructurados.
2. Salida estructurada.
3. Interfaces oficiales de integración.
4. Parsing de stdout y stderr como mecanismo de compatibilidad o respaldo.

Si necesitas hacer parsing de texto, encapsúlalo detrás de una interfaz para poder reemplazarlo posteriormente.

Por ejemplo:

```text
ClaudeCodeTransport
        │
        ▼
EventNormalizer
        │
        ▼
UnifiedClaudeEvent
```

La interfaz visual nunca debería depender directamente del formato crudo de Claude Code.

El cambio de presentación debe consumir el estado y los eventos normalizados, no comunicarse directamente con el proceso de Claude Code.

---

# MODELO DE EVENTOS

Diseña un modelo interno de eventos normalizados.

Por ejemplo:

```typescript
type ClaudeEvent =
  | {
      type: "session_started";
      sessionId: string;
    }
  | {
      type: "assistant_message";
      content: string;
    }
  | {
      type: "thinking";
    }
  | {
      type: "tool_started";
      tool: string;
      input?: unknown;
    }
  | {
      type: "tool_finished";
      tool: string;
      success: boolean;
    }
  | {
      type: "file_read";
      path: string;
    }
  | {
      type: "file_modified";
      path: string;
    }
  | {
      type: "command_started";
      command: string;
    }
  | {
      type: "command_finished";
      command: string;
      success: boolean;
    }
  | {
      type: "permission_required";
      description: string;
    }
  | {
      type: "interaction_required";
      requestId: string;
      request: UserInteractionRequest;
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "session_finished";
    };
```

Este modelo es solamente una referencia inicial.

Investiga qué eventos reales pueden obtenerse de Claude Code y adapta el diseño a la información realmente disponible.

Los eventos deben conservar suficiente información para que la interfaz completa, el modo compañera y el modo Pet puedan representar el mismo estado de forma diferente.

---

# CONSOLA PERSONALIZADA

No abras una ventana de PowerShell, CMD o terminal externa para mostrar la actividad.

La aplicación debe tener su propio visor de consola.

Ejemplo conceptual:

```text
┌─────────────────────────────────────────────┐
│ ACTIVIDAD                                   │
├─────────────────────────────────────────────┤
│                                             │
│ ✓ Sesión iniciada                           │
│                                             │
│ 📖 Leyendo                                  │
│    src/components/App.vue                  │
│                                             │
│ ⚙ Ejecutando                                │
│    npm test                                 │
│                                             │
│ ✓ 48 pruebas completadas                    │
│                                             │
│ ✎ Modificando                               │
│    src/router/index.ts                      │
│                                             │
└─────────────────────────────────────────────┘
```

Debe actualizarse en tiempo real.

Debe conservar un modo de salida cruda para poder inspeccionar exactamente lo que recibió la aplicación desde Claude Code.

No ocultes información importante del usuario solamente porque la interfaz sea bonita.

La consola y el chat deben poder ocultarse visualmente en los modos compañera y Pet sin dejar de recibir, registrar ni procesar eventos.

---

# CHAT

La interfaz de chat debe permitir:

- Escribir mensajes.
- Enviarlos a Claude Code.
- Mostrar mensajes del usuario.
- Mostrar respuestas de Claude.
- Mostrar actividad de herramientas.
- Mostrar comandos.
- Mostrar archivos afectados.
- Mostrar errores.
- Mostrar solicitudes de permisos.
- Mostrar opciones, formularios y preguntas abiertas.
- Mostrar interacciones pendientes cuando la sesión se encuentre en modo Pet.

El chat debe recibir los eventos en streaming cuando sea posible.

No esperes necesariamente a que termine toda la operación para actualizar la interfaz.

Cuando el chat esté oculto, las interacciones pendientes deben conservarse y mostrarse al restaurar la interfaz completa.

---

# AVATAR VTUBER

Implementa inicialmente una abstracción para el avatar.

No acoples toda la aplicación a un único sistema de avatar.

Debe existir algo conceptualmente similar a:

```typescript
interface AvatarController {
  setState(state: AvatarState): void;
  setExpression(expression: AvatarExpression): void;
  speak(text: string): Promise<void>;
  stopSpeaking(): void;
}
```

Estados iniciales:

```text
idle
thinking
reading
coding
executing
waiting_permission
success
error
confused
sleeping
speaking
```

Expresiones iniciales:

```text
neutral
happy
sad
surprised
confused
angry
tired
excited
```

El avatar debe poder renderizarse tanto en una interfaz normal como dentro de una ventana transparente y flotante.

La abstracción no debe asumir que siempre existe un fondo opaco, un panel de actividad o una ventana con foco.

---

# REACCIONES DEL AVATAR

El avatar debe reaccionar automáticamente a los eventos de Claude.

Ejemplos:

```text
file_read
    ↓
thinking / reading

file_modified
    ↓
coding

command_started
    ↓
executing

permission_required
    ↓
waiting_permission

command_finished + success
    ↓
happy

error
    ↓
surprised / worried

session_finished
    ↓
happy
```

No hagas que cada evento produzca necesariamente una reacción exagerada.

Debe existir una capa que decida cuándo reaccionar.

Por ejemplo:

```text
Claude realiza 15 lecturas de archivos
        ↓
NO hablar 15 veces

La VTuber puede permanecer concentrada
        ↓
"Estoy revisando el proyecto..."
```

La actividad detallada permanece visible en la consola cuando esta se encuentre disponible.

En modo Pet, la actividad detallada puede permanecer oculta, pero el avatar debe seguir reaccionando al estado real de Claude.

---

# PERSONALIDAD

Implementa una capa separada:

```text
Claude Events
      ↓
Personality / Reaction Engine
      ↓
Avatar + Voice + UI
```

Esta capa decide:

- Expresión.
- Animación.
- Estado.
- Si debe hablar.
- Qué debería decir.
- Prioridad de la reacción.
- Si debe emitir una notificación.
- Si debe solicitar la atención del usuario.
- Qué reacción debe utilizarse cuando la interfaz está en modo Pet.

No debe modificar el razonamiento de Claude.

Inicialmente puede utilizar reglas deterministas.

NO agregues otro modelo de IA para esto salvo que exista una razón técnica clara.

El motor de reacciones debe funcionar independientemente del modo de presentación. El modo de presentación solamente determina cómo se muestra cada reacción.

---

# VOZ / TEXT-TO-SPEECH

Sí quiero soporte de voz.

La aplicación debe tener una abstracción de TTS:

```typescript
interface TextToSpeech {
  speak(text: string): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
}
```

No acoples la aplicación a un único proveedor.

Permite posteriormente implementar distintos motores de voz.

La voz debe ser opcional.

Debe existir:

- Activar y desactivar voz.
- Volumen.
- Velocidad.
- Voz seleccionable.
- Cola de reproducción.
- Cancelación de reproducción.

MUY IMPORTANTE:

Claude no debe leer absolutamente toda la actividad técnica.

La consola puede mostrar todo.

La voz debe hablar únicamente cuando la capa de personalidad considere que algo merece ser comunicado.

Ejemplo:

```text
Consola:
✓ Reading package.json
✓ Reading tsconfig.json
✓ Reading vite.config.ts
✓ Reading src/App.vue

VTuber:

"Estoy revisando la estructura del proyecto."
```

En modo Pet, la voz debe ser configurable y no debe activarse de forma intrusiva salvo que el usuario lo haya permitido.

---

# SINCRONIZACIÓN DE BOCA

Diseña la integración para poder sincronizar el avatar con el audio.

Inicialmente puede utilizarse un mecanismo sencillo basado en actividad o amplitud del audio.

Más adelante debe ser posible sustituirlo por sincronización mediante fonemas o visemas.

No mezcles esta lógica con el motor de Claude.

La sincronización debe seguir funcionando cuando el avatar se muestre en una ventana transparente, siempre que el renderizador y el sistema operativo lo permitan.

---

# MODOS DE PRESENTACIÓN

La aplicación debe tener inicialmente tres modos principales:

```typescript
type PresentationMode = "FULL" | "COMPANION" | "PET";
```

La presentación debe estar centralizada en un `PresentationManager` y no debe depender de condiciones dispersas como `if (mode === "pet")` por toda la aplicación.

## 1. Modo completo

Es la interfaz principal de la aplicación.

Debe mostrar:

- La VTuber.
- El chat.
- La actividad o consola personalizada.
- Controles de la aplicación.
- Estado actual de Claude.
- Indicadores de interacción pendientes.
- Controles para cambiar de modo.
- Acceso a la salida cruda.
- Acceso a la configuración.

El chat debe poder ocultarse mediante un botón para dar mayor protagonismo al avatar o a la actividad.

La consola o actividad también debe poder ocultarse de forma independiente.

Ejemplo conceptual:

```text
┌────────────────────────────────────────────────────────┐
│  Proyecto: MiProyecto       Modo: Completo    ⚙  ─ □ × │
├────────────────────────────────────────────────────────┤
│                                                        │
│                  ┌─────────────┐                       │
│                  │             │                       │
│                  │   VTUBER    │                       │
│                  │             │                       │
│                  └─────────────┘                       │
│                                                        │
│        "Estoy revisando el problema..."               │
│                                                        │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ACTIVIDAD                                             │
│                                                        │
│  ✓ Leyendo src/App.vue                                 │
│  ⚙ Ejecutando npm test                                 │
│  ✎ Modificando src/router.ts                           │
│                                                        │
├────────────────────────────────────────────────────────┤
│  > Escribe una instrucción...                    ➤    │
└────────────────────────────────────────────────────────┘
```

## 2. Modo compañera

Debe existir un modo visual minimalista en el que la interfaz de trabajo prácticamente desaparezca.

La VTuber debe quedar como protagonista, centrada en la ventana y completamente animada.

Debe ser posible:

- Ocultar el chat.
- Ocultar la consola o actividad.
- Difuminar o atenuar la interfaz cuando corresponda.
- Centrar la VTuber.
- Mantener funcionando Claude Code y todos sus eventos en segundo plano.
- Mantener las animaciones, expresiones y reacciones del avatar.
- Mantener las notificaciones importantes.
- Volver al modo completo mediante una interacción sencilla.
- Restaurar el chat y la actividad según la configuración anterior.

La intención es poder dejar la aplicación abierta simplemente para disfrutar de la presencia del personaje mientras Claude trabaja o mientras no se necesita interacción técnica.

El modo compañera no debe confundirse con minimizar la aplicación ni con el modo Pet. La ventana sigue siendo una ventana normal de la aplicación, aunque su contenido sea minimalista.

## 3. Modo Pet o mascota de escritorio

Este modo es especialmente importante.

Cuando Claude esté trabajando y no requiera interacción del usuario, debe existir una opción para convertir la aplicación en una mascota de escritorio.

En este modo:

- La ventana principal deja de ocupar espacio significativo.
- La VTuber aparece en una esquina del escritorio.
- El fondo de la ventana debe ser transparente cuando la plataforma y el renderizador lo permitan.
- No deben mostrarse paneles, chat ni consola.
- La VTuber debe continuar animándose.
- Debe continuar reaccionando a los eventos reales de Claude Code.
- Claude debe seguir trabajando normalmente en segundo plano.
- El usuario debe poder continuar utilizando otras aplicaciones con normalidad.
- La VTuber no debe robar el foco innecesariamente.
- Hacer clic en la VTuber debe restaurar la interfaz principal.
- Las interacciones pendientes deben conservarse y mostrarse al restaurar la interfaz.
- El modo Pet debe poder desactivarse sin detener la sesión.
- El comportamiento debe ser explícito y configurable cuando Claude requiera atención.

Conceptualmente:

```text
Escritorio de Windows
──────────────────────────────────────────────

                Visual Studio
        ┌───────────────────────────────┐
        │                               │
        │       trabajando...           │
        │                               │
        │                               │
        └───────────────────────────────┘


                                  ┌─────────┐
                                  │ VTUBER  │
                                  │  👀     │
                                  └─────────┘
```

La VTuber debe seguir siendo un indicador visual del estado de Claude.

Por ejemplo:

```text
Claude trabajando
        ↓
VTuber tranquila / concentrada

Claude ejecutando herramientas
        ↓
VTuber reacciona

Claude termina correctamente
        ↓
VTuber celebra brevemente

Claude necesita interacción
        ↓
VTuber realiza una reacción llamativa
        ↓
Usuario hace clic
        ↓
Se restaura la ventana completa
        ↓
Se muestra la solicitud pendiente
```

Cuando Claude requiera la atención del usuario, el Pet debe hacerlo evidente mediante una combinación configurable de:

- Cambio de expresión.
- Animación.
- Indicador visual.
- Burbuja o notificación.
- Voz, si el TTS está habilitado.
- Cambio de iluminación.
- Icono de estado.
- Notificación del sistema, si el usuario la permite.
- Otras señales no intrusivas.

No debe exigir que el usuario esté mirando constantemente la consola para saber si Claude necesita algo.

El modo Pet no debe asumir que siempre puede capturar clics de forma perfecta. Debe investigarse si es posible hacer click-through en regiones transparentes y capturar clics únicamente sobre el avatar. Si la plataforma no lo permite de forma fiable, debe existir un fallback documentado y usable.

---

# INVESTIGAR WINDOWS Y TAURI ANTES DE IMPLEMENTAR EL MODO PET

Este requisito introduce características específicas de gestión de ventanas y escritorio que no deben resolverse improvisando desde Vue.

Antes de implementar el modo Pet, investiga y documenta las capacidades actuales de:

- Tauri.
- Rust.
- Windows.
- APIs nativas de ventanas de Windows cuando sean necesarias.
- El renderizador utilizado por la aplicación.
- Las limitaciones de ventanas transparentes en cada plataforma.

Investiga específicamente:

- Ventanas sin bordes.
- Transparencia real.
- Fondos transparentes.
- Transparencia por píxel.
- Ventanas siempre encima.
- Posicionamiento absoluto.
- Posicionamiento relativo al escritorio.
- Múltiples monitores.
- DPI y escalado de Windows.
- Foco de ventana.
- Activación y desactivación de foco.
- Click-through.
- Regiones transparentes que permitan atravesar los clics.
- Captura del clic únicamente sobre el avatar.
- Restauración de la ventana.
- Minimización.
- Maximización.
- Cambio dinámico de tamaño.
- Cambio dinámico de posición.
- Comportamiento al cambiar de aplicación.
- Comportamiento con ventanas maximizadas.
- Barra de tareas.
- Alt+Tab.
- Bloqueo y desbloqueo de Windows.
- Pantalla completa de otras aplicaciones.
- Múltiples escritorios virtuales, si aplica.
- Compatibilidad con aceleración gráfica.
- Rendimiento de una ventana transparente con un avatar animado.
- Comportamiento al suspender y reanudar el equipo.
- Comportamiento con escalado superior al 100 %.
- Comportamiento con monitores de distinta densidad de píxeles.
- Restauración después de desconectar un monitor.
- Interacción con escritorios remotos, si aplica.
- Compatibilidad con accesibilidad y reducción de movimiento.

No asumas que todas estas características funcionan exactamente igual en Windows, macOS y Linux.

La investigación debe distinguir entre:

- Funcionalidad garantizada por Tauri.
- Funcionalidad disponible mediante plugins.
- Funcionalidad que requiere código Rust específico.
- Funcionalidad que requiere APIs nativas del sistema operativo.
- Funcionalidad experimental o no garantizada.
- Funcionalidad que debe tener un fallback.

---

# DISEÑAR UNA ABSTRACCIÓN MULTIPLATAFORMA

Aunque el modo Pet pueda implementarse inicialmente con prioridad para Windows, no acoples toda la aplicación a APIs específicas de Windows.

Crea una abstracción conceptual:

```text
DesktopWindowManager
        │
        ├── WindowsWindowManager
        ├── MacOSWindowManager
        └── LinuxWindowManager
```

La interfaz de la aplicación debería trabajar con conceptos como:

```typescript
interface DesktopWindowManager {
  setPresentationMode(mode: PresentationMode): Promise<void>;
  setAlwaysOnTop(enabled: boolean): Promise<void>;
  setTransparent(enabled: boolean): Promise<void>;
  setBorderless(enabled: boolean): Promise<void>;
  setPosition(position: WindowPosition): Promise<void>;
  setSize(size: WindowSize): Promise<void>;
  setIgnoreMouseEvents(enabled: boolean, options?: MouseEventOptions): Promise<void>;
  setFocusable(enabled: boolean): Promise<void>;
  show(): Promise<void>;
  hide(): Promise<void>;
  minimize(): Promise<void>;
  restore(): Promise<void>;
  focus(): Promise<void>;
  getMonitors(): Promise<MonitorInfo[]>;
  getCurrentMonitor(): Promise<MonitorInfo | null>;
}
```

Los tipos deben ser explícitos y extensibles:

```typescript
type WindowPosition =
  | {
      type: "absolute";
      x: number;
      y: number;
    }
  | {
      type: "screen_corner";
      corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
      marginX: number;
      marginY: number;
    }
  | {
      type: "monitor_relative";
      monitorId: string;
      x: number;
      y: number;
    };

interface WindowSize {
  width: number;
  height: number;
}

interface MouseEventOptions {
  forwardToUnderlyingWindow?: boolean;
  hitTestAvatarOnly?: boolean;
}

interface MonitorInfo {
  id: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  workArea: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  scaleFactor: number;
  isPrimary: boolean;
}
```

La implementación real puede utilizar APIs diferentes según el sistema operativo.

No implementes esta interfaz basándote únicamente en suposiciones: investiga primero qué puede hacer realmente Tauri y qué requiere integración nativa.

Si una capacidad no está disponible en una plataforma, el adaptador debe devolver un error tipado o aplicar un fallback documentado. No debe fallar silenciosamente.

---

# MÁQUINA DE ESTADOS DE PRESENTACIÓN

No distribuyas condiciones como `if (mode === "pet")` por toda la aplicación.

Diseña un sistema centralizado de presentación.

Por ejemplo:

```text
FULL
 │
 ├── ocultar chat
 │
 ▼
COMPANION
 │
 ├── enviar al escritorio
 │
 ▼
PET

PET
 │
 └── click en VTuber
        ↓
      FULL
```

También debe ser posible que la presentación y la visibilidad de los paneles sean estados independientes:

```text
PresentationMode:
    FULL
    COMPANION
    PET

ChatVisibility:
    VISIBLE
    HIDDEN

ActivityVisibility:
    VISIBLE
    HIDDEN

AvatarPosition:
    CENTER
    CORNER
```

Esto debe permitir futuras combinaciones sin tener que rediseñar toda la interfaz.

Un modelo inicial podría ser:

```typescript
interface PresentationState {
  mode: PresentationMode;
  chatVisibility: "VISIBLE" | "HIDDEN";
  activityVisibility: "VISIBLE" | "HIDDEN";
  avatarPosition: "CENTER" | "CORNER";
  window: {
    transparent: boolean;
    borderless: boolean;
    alwaysOnTop: boolean;
    focusable: boolean;
    ignoreMouseEvents: boolean;
  };
  pendingInteractionCount: number;
}
```

El `PresentationManager` debe:

- Recibir cambios de modo.
- Validar transiciones.
- Coordinar la visibilidad de los paneles.
- Coordinar el `DesktopWindowManager`.
- Mantener el estado de la sesión intacto.
- Restaurar la configuración anterior cuando corresponda.
- Notificar al avatar y a la UI sobre cambios de presentación.
- Gestionar fallbacks cuando una plataforma no soporte una capacidad.
- Evitar que una transición incompleta deje la aplicación en un estado inconsistente.

---

# SEPARAR “MINIMIZAR” DE “ENVIAR AL ESCRITORIO”

No trates ambas acciones como equivalentes.

Debe existir conceptualmente:

**Minimizar**

> Quitar la aplicación de la vista mediante el comportamiento normal del sistema operativo.

**Enviar al escritorio**

> Convertir la aplicación en la mascota VTuber mientras Claude continúa trabajando.

El segundo comportamiento es el modo Pet.

Minimizar no debe cambiar automáticamente el modo de presentación, salvo que el usuario lo configure explícitamente.

Enviar al escritorio no debe detener Claude, cerrar la sesión ni equivaler a ocultar completamente el proceso.

---

# PERSISTENCIA Y CONFIGURACIÓN

Permite posteriormente configurar:

- Esquina donde aparece la VTuber.
- Tamaño del avatar.
- Tamaño de la ventana Pet.
- Opacidad.
- Siempre encima.
- Activar y desactivar voz.
- Comportamiento cuando Claude necesita atención.
- Animaciones.
- Sensibilidad de las reacciones.
- Monitor donde aparece.
- Si debe entrar automáticamente en modo Pet cuando Claude trabaja sin interacción.
- Si debe mostrar notificaciones del sistema.
- Si debe reproducir voz en modo Pet.
- Si debe robar el foco al restaurar la interfaz.
- Si debe ignorar clics fuera del avatar.
- Margen respecto al área de trabajo.
- Comportamiento al cambiar de monitor.
- Comportamiento al bloquear o desbloquear el sistema.
- Preferencia de modo inicial.
- Visibilidad inicial del chat.
- Visibilidad inicial de la actividad.
- Preferencias por proyecto o sesión.

No es necesario implementar todas estas opciones inmediatamente, pero la arquitectura debe permitir agregarlas.

La configuración debe persistirse sin incluir secretos, tokens ni credenciales.

---

# REGLA FUNDAMENTAL

El cambio de modo visual NO debe afectar a Claude Code.

Ejemplo:

```text
Claude Code
    ↓
trabajando
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
Usuario hace clic
    ↓
FULL
    ↓
Se muestra la solicitud pendiente
```

La capa de presentación solamente modifica cómo se muestra el estado de la sesión.

No debe detener, reiniciar, duplicar ni alterar innecesariamente el proceso de Claude.

El `PresentationManager` no debe depender de detalles internos del transporte. Debe recibir estado y eventos mediante interfaces públicas.

---

# INTERFAZ PRINCIPAL

La aplicación debería tener un diseño parecido a:

```text
┌────────────────────────────────────────────────────────┐
│  Proyecto: MiProyecto                    ⚙   ─ □ ×   │
├────────────────────────────────────────────────────────┤
│                                                        │
│                  ┌─────────────┐                       │
│                  │             │                       │
│                  │   VTUBER    │                       │
│                  │             │                       │
│                  └─────────────┘                       │
│                                                        │
│        "Estoy revisando el problema..."               │
│                                                        │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ACTIVIDAD                                             │
│                                                        │
│  ✓ Leyendo src/App.vue                                 │
│  ⚙ Ejecutando npm test                                 │
│  ✎ Modificando src/router.ts                           │
│                                                        │
├────────────────────────────────────────────────────────┤
│  > Escribe una instrucción...                    ➤    │
└────────────────────────────────────────────────────────┘
```

El diseño debe sentirse moderno, elegante y dinámico.

No quiero una aplicación empresarial genérica.

Debe sentirse como una aplicación de escritorio de personaje o VTuber.

Los controles de presentación deben ser claros, accesibles y no deben ocultarse de forma que el usuario no pueda recuperar la interfaz.

---

# MODO CONSOLA

Debe existir un modo donde el usuario pueda ver una representación mucho más cercana al comportamiento tradicional de Claude Code.

Algo como:

```text
┌─────────────────────────────────────────────────────┐
│ CONSOLA                                              │
├─────────────────────────────────────────────────────┤
│                                                     │
│ > claude                                            │
│                                                     │
│ Claude:                                             │
│ I'll inspect the project structure first.           │
│                                                     │
│ > Reading src/App.vue                               │
│ > Running npm test                                  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Pero seguirá siendo nuestra propia interfaz.

No abras una terminal externa.

Debe existir una opción para alternar:

```text
[ Chat ] [ Actividad ] [ Consola ]
```

La consola puede ocultarse en modo compañera y Pet, pero la salida debe seguir registrándose y estar disponible al restaurar la interfaz.

---

# PROYECTOS Y SESIONES

La arquitectura debe permitir posteriormente:

- Seleccionar directorio de trabajo.
- Crear una sesión.
- Continuar una sesión.
- Tener varias sesiones.
- Ver el proyecto actual.
- Recordar configuración del avatar por proyecto.
- Recordar configuración de presentación por proyecto.
- Restaurar el último modo utilizado, si el usuario lo permite.
- Mantener eventos pendientes al cambiar de presentación.
- Asociar el monitor y la posición del Pet a un proyecto o configuración global.

No es necesario implementar todas estas funciones en el MVP, pero no diseñes la arquitectura de forma que impida agregarlas.

---

# SEGURIDAD

Esto es MUY importante.

Claude Code puede ejecutar comandos.

La aplicación NO debe intentar ocultar o saltarse mecanismos de permisos existentes.

Si Claude Code solicita autorización:

```text
VTUBER:

"Necesito permiso para ejecutar este comando."

[ Permitir ] [ Rechazar ]
```

La respuesta debe transmitirse al mecanismo real de Claude Code.

No inventes un sistema paralelo de permisos que pueda provocar que se ejecuten comandos sin autorización.

En modo Pet, una solicitud de permiso debe producir una señal visible y configurable. El usuario debe poder restaurar la interfaz completa y revisar el contexto técnico antes de responder.

No permitas que el modo Pet convierta una solicitud pendiente en una autorización implícita.

---

# MANEJO DE ERRORES

La aplicación debe distinguir entre:

- Error de Claude Code.
- Error del proceso.
- Error de comunicación.
- Error de parsing.
- Error de TTS.
- Error de avatar.
- Error de interfaz.
- Error de gestión de ventana.
- Capacidad no soportada por la plataforma.
- Error al cambiar de modo.
- Error al restaurar la ventana.
- Error al obtener monitores o áreas de trabajo.

Un fallo del avatar NO debe matar la sesión de Claude.

Un fallo del TTS NO debe detener Claude.

Un fallo del parser NO debe impedir mostrar la salida cruda.

Un fallo de la ventana Pet NO debe detener Claude ni perder eventos.

Si una transición de presentación falla, la aplicación debe:

1. Registrar el error.
2. Mantener la sesión de Claude activa.
3. Intentar restaurar un modo seguro.
4. Informar al usuario.
5. Conservar las interacciones pendientes.
6. Evitar dejar una ventana invisible o inaccesible.

La arquitectura debe ser tolerante a fallos.

---

# REGLA DE ORO DE DEPURACIÓN

Siempre debe existir un camino:

```text
Claude Code
    ↓
Raw Output
    ↓
Event Parser
    ↓
Normalized Events
    ↓
UI
```

Si el parser falla:

```text
Claude Code
    ↓
Raw Output
    ↓
UI
```

El usuario nunca debería quedarse sin información simplemente porque nuestro parser no entendió una salida nueva.

El cambio de modo tampoco debe ocultar permanentemente la salida cruda ni los eventos pendientes.

---

# DESARROLLO

Antes de comenzar a programar:

1. Inspecciona el repositorio actual.
2. Determina si ya existe un proyecto Tauri/Vue.
3. Analiza la estructura existente.
4. Investiga la forma correcta y actual de integrar Claude Code.
5. Investiga las capacidades reales de Tauri y del sistema operativo para la gestión de ventanas.
6. Identifica qué información puede recibirse en tiempo real.
7. Determina qué partes requieren parsing y cuáles pueden obtenerse estructuradamente.
8. Identifica qué capacidades del modo Pet son multiplataforma.
9. Identifica cuáles requieren código específico de Windows.
10. Construye una prueba de concepto mínima de ventana transparente antes de integrar el modo Pet.
11. Comprueba foco, click-through, posición, restauración y múltiples monitores.
12. Documenta las limitaciones encontradas.
13. Propón una arquitectura concreta.
14. Explica las decisiones importantes.
15. Después implementa.

NO destruyas código existente sin entenderlo.

NO reestructures todo el proyecto innecesariamente.

Si encuentras una decisión arquitectónica que puede afectar seriamente la compatibilidad futura, detente y explícala antes de continuar.

---

# FASE 0: INVESTIGACIÓN OBLIGATORIA ANTES DE ESCRIBIR CÓDIGO

Antes de implementar funcionalidades importantes, realiza una investigación técnica y de diseño exhaustiva. No empieces a crear componentes, parsers, animaciones, integraciones ni sistemas de ventanas basándote en suposiciones.

Primero inspecciona el repositorio local y después investiga en internet utilizando documentación oficial, repositorios, ejemplos funcionales y fuentes actualizadas.

Distingue claramente entre:

- Información confirmada por documentación oficial.
- Comportamiento observado experimentalmente.
- Inferencias o hipótesis.
- Funcionalidades no disponibles o no garantizadas.
- Funcionalidades que requieren integración nativa.
- Funcionalidades que necesitan un fallback.

No des por hecho que la salida visible en una terminal es la única interfaz de Claude Code.

Tampoco des por hecho que una ventana transparente implementada en Vue se comportará como una mascota de escritorio real.

## Entregable obligatorio de la investigación

Antes de realizar cambios grandes, crea un documento de investigación, por ejemplo:

```text
docs/research/claude-code-vtuber-integration.md
```

Puede dividirse en varios documentos si resulta más claro, por ejemplo:

```text
docs/research/claude-code-vtuber-integration.md
docs/research/desktop-window-management.md
docs/research/avatar-and-tts.md
docs/research/experimental-results.md
```

Debe incluir:

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
13. Qué capacidades del modo Pet requieren APIs nativas.
14. Qué fallbacks deben existir.
15. Qué comportamiento no puede garantizarse en todas las plataformas.

Si una fuente contradice a otra, documenta la contradicción y realiza una prueba local antes de elegir una implementación.

---

# INVESTIGACIÓN DE LA INTEGRACIÓN REAL CON CLAUDE CODE

Investiga específicamente:

- Formas oficiales de iniciar Claude Code desde otro proceso.
- Modos interactivos y no interactivos.
- Opciones de entrada y salida.
- Streaming de respuestas.
- Formatos estructurados disponibles.
- Eventos de sesión.
- Identificadores de sesión.
- Continuación y reanudación de sesiones.
- Directorio de trabajo.
- Comunicación mediante stdin, stdout y stderr.
- Solicitudes de permisos.
- Respuestas del usuario.
- Herramientas utilizadas.
- Lectura y modificación de archivos.
- Ejecución de comandos.
- Resultados de herramientas.
- Errores.
- Interrupciones.
- Cancelación.
- Finalización normal.
- Finalización por error.
- Cambios entre versiones.
- Hooks, callbacks, plugins, SDKs, APIs o interfaces oficiales.
- Posibilidad de recibir eventos sin depender de texto humano.
- Diferencias entre salida destinada a humanos y salida destinada a automatización.
- Códigos de salida y señales del proceso.
- Comportamiento en Windows, macOS y Linux.
- Requisitos de autenticación.
- Requisitos de instalación.
- Restricciones de distribución de la aplicación.

No implementes el transporte definitivo hasta entender estas posibilidades.

Si no existe una API oficial suficientemente completa, diseña una capa de transporte con varios adaptadores:

```text
ClaudeCodeTransport
├── StructuredTransport
├── OfficialApiTransport
├── ProcessTransport
└── FallbackRawTransport
```

El resto de la aplicación debe depender únicamente de una interfaz común.

---

# INVESTIGACIÓN DE LA GESTIÓN DE VENTANAS Y DEL MODO PET

Investiga por separado la gestión de ventanas, sin mezclarla con la integración de Claude Code.

Documenta:

- Qué opciones de ventana ofrece Tauri de forma oficial.
- Qué plugins de Tauri son relevantes.
- Qué capacidades requieren Rust.
- Qué capacidades requieren APIs nativas de Windows.
- Qué APIs de Windows pueden ser necesarias para transparencia, foco, hit testing y click-through.
- Qué limitaciones tiene una ventana transparente con aceleración gráfica.
- Qué diferencias existen entre una ventana transparente y una ventana con fondo semitransparente.
- Qué significa realmente ignorar eventos de ratón.
- Si es posible hacer click-through únicamente en regiones transparentes.
- Si es posible capturar clics únicamente sobre el avatar.
- Cómo se comporta la ventana en Alt+Tab.
- Cómo se comporta con la barra de tareas.
- Cómo se comporta al cambiar de aplicación.
- Cómo se comporta con aplicaciones a pantalla completa.
- Cómo se comporta al bloquear y desbloquear Windows.
- Cómo se comporta con múltiples monitores.
- Cómo se calcula correctamente el área de trabajo excluyendo la barra de tareas.
- Cómo se gestiona DPI y escalado.
- Qué ocurre al desconectar el monitor donde estaba el Pet.
- Qué ocurre al cambiar la escala del monitor.
- Qué ocurre al suspender y reanudar el equipo.
- Qué ocurre si la ventana pierde el foco.
- Qué ocurre si el usuario utiliza escritorios virtuales.
- Qué ocurre con escritorios remotos.
- Qué rendimiento puede esperarse con un avatar animado.
- Qué fallback debe utilizarse si la transparencia o el click-through no funcionan.

Construye una prueba de concepto mínima antes de integrar el modo Pet:

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

Documenta los resultados reales y no solamente las expectativas.

---

# CATÁLOGO COMPLETO DE EVENTOS Y ESTADOS

No te limites a eventos como `assistant_message`, `tool_started` o `error`.

Investiga y enumera todos los tipos de interacción que Claude Code pueda producir o solicitar, incluyendo, como mínimo:

## Ciclo de sesión

- Inicio de sesión.
- Inicialización.
- Identificador de sesión.
- Reanudación.
- Cambio de proyecto.
- Cambio de directorio de trabajo.
- Espera.
- Pausa.
- Reanudación.
- Cancelación.
- Interrupción.
- Finalización exitosa.
- Finalización con error.
- Desconexión.
- Reconexión, si aplica.

## Mensajes del asistente

- Texto normal.
- Texto incremental en streaming.
- Mensajes parciales.
- Mensajes finales.
- Resúmenes.
- Explicaciones.
- Advertencias.
- Errores.
- Mensajes con formato Markdown.
- Mensajes con bloques de código.
- Mensajes con listas.
- Mensajes con tablas.
- Mensajes con enlaces.
- Mensajes con imágenes o referencias visuales, si aplica.
- Mensajes que contienen diagramas ASCII.
- Mensajes que contienen diffs.
- Mensajes que contienen rutas de archivos.
- Mensajes que contienen comandos.
- Mensajes que contienen resultados de pruebas.
- Mensajes que contienen preguntas.

## Solicitudes de respuesta del usuario

Investiga especialmente todas las formas en que Claude Code puede pedir interacción humana.

No asumas que siempre será una simple confirmación de “sí” o “no”.

Documenta y modela, como mínimo, posibles variantes de:

- Permitir o rechazar una herramienta.
- Permitir o rechazar un comando.
- Permitir o rechazar una modificación.
- Confirmar una acción destructiva.
- Elegir entre varias opciones.
- Responder una pregunta abierta.
- Proporcionar información adicional.
- Seleccionar archivos o rutas.
- Elegir un modo de ejecución.
- Confirmar continuar.
- Confirmar cancelar.
- Resolver una ambigüedad.
- Proporcionar credenciales o configuración, si aplica.
- Responder formularios con varios campos.
- Responder opciones con valores predefinidos.
- Solicitudes que aparecen durante una herramienta.
- Solicitudes que aparecen antes de una herramienta.
- Solicitudes que pueden expirar.
- Solicitudes que pueden cancelarse.
- Solicitudes simultáneas o anidadas.
- Solicitudes que requieren mostrar contexto técnico.

Diseña un modelo extensible, por ejemplo:

```typescript
type UserInteractionRequest =
  | {
      type: "permission";
      requestId: string;
      title: string;
      description?: string;
      risk?: "low" | "medium" | "high";
      action?: string;
      details?: unknown;
      options: InteractionOption[];
    }
  | {
      type: "choice";
      requestId: string;
      title: string;
      description?: string;
      options: InteractionOption[];
      allowMultiple?: boolean;
    }
  | {
      type: "text_input";
      requestId: string;
      title: string;
      description?: string;
      placeholder?: string;
      defaultValue?: string;
      validation?: unknown;
    }
  | {
      type: "form";
      requestId: string;
      title: string;
      fields: InteractionField[];
    }
  | {
      type: "confirmation";
      requestId: string;
      title: string;
      description?: string;
      confirmLabel?: string;
      cancelLabel?: string;
    };
```

Este modelo es orientativo. Adáptalo a los mecanismos reales descubiertos durante la investigación.

La interfaz debe poder representar cada tipo de solicitud de forma clara y atractiva, sin reducir todas las interacciones a botones genéricos de “Aceptar” y “Cancelar”.

---

# INVESTIGACIÓN DE LA SALIDA MARKDOWN Y ASCII

Claude Code puede producir texto con formato Markdown, código, tablas, listas, citas, enlaces, diffs y arte ASCII.

Investiga:

- Qué sintaxis Markdown aparece realmente.
- Qué extensiones o variantes utiliza.
- Cómo se representan los bloques de código.
- Cómo se representan los diffs.
- Cómo se representan las tablas.
- Cómo se representan las listas anidadas.
- Cómo se representan las rutas de archivos.
- Cómo se representan los comandos.
- Cómo se representan los mensajes de advertencia.
- Cómo se representan los diagramas ASCII.
- Qué secuencias de escape o colores pueden aparecer.
- Qué contenido llega fragmentado por streaming.
- Cómo detectar cuándo un bloque está incompleto.
- Cómo preservar el contenido original.
- Cómo evitar que un parser rompa texto parcialmente recibido.

No construyas simplemente un lector Markdown genérico y des por terminado el problema.

La aplicación debe tener una capa de interpretación semántica:

```text
Raw Claude Output
        ↓
Streaming Buffer
        ↓
Markdown / ANSI / ASCII Parser
        ↓
Semantic Content Blocks
        ↓
Anime-Oriented Renderer
```

Por ejemplo:

```typescript
type ContentBlock =
  | {
      type: "paragraph";
      text: string;
    }
  | {
      type: "heading";
      level: number;
      text: string;
    }
  | {
      type: "code";
      language?: string;
      code: string;
    }
  | {
      type: "diff";
      file?: string;
      additions: DiffLine[];
      deletions: DiffLine[];
    }
  | {
      type: "file_reference";
      path: string;
      action?: "read" | "write" | "modify" | "delete";
    }
  | {
      type: "command";
      command: string;
      status?: "pending" | "running" | "success" | "failed";
    }
  | {
      type: "table";
      headers: string[];
      rows: string[][];
    }
  | {
      type: "ascii_art";
      content: string;
      detectedTheme?: string;
    }
  | {
      type: "warning";
      text: string;
    }
  | {
      type: "error";
      text: string;
    }
  | {
      type: "plain_text";
      text: string;
    };
```

La interfaz debe poder transformar estos bloques en presentaciones visuales más expresivas:

- Tarjetas de archivo.
- Tarjetas de comando.
- Paneles de resultado.
- Diffs con colores y animaciones.
- Indicadores de progreso.
- Burbujas de diálogo.
- Ventanas de advertencia.
- Paneles de decisión.
- Diagramas ASCII dentro de marcos temáticos.
- Código con resaltado.
- Tablas adaptadas a la estética de la aplicación.
- Mensajes importantes con efectos visuales moderados.

No alteres el significado técnico del contenido.

Debe existir siempre una opción para ver:

1. La representación bonita.
2. El Markdown interpretado.
3. La salida cruda original.

La representación visual puede ser estilizada, pero no debe ocultar ni modificar información relevante.

---

# INVESTIGACIÓN DE REPRESENTACIÓN VISUAL ANIME

Investiga referencias de diseño para interfaces de escritorio tipo:

- VTuber companion.
- Anime desktop assistant.
- Visual novel interface.
- RPG quest log.
- Terminal futurista.
- HUD de anime.
- Consola holográfica.
- Chat con personaje.
- Panel de misión.
- Sistema de afinidad o estado emocional, sin convertirlo en un juego obligatorio.

Define una guía visual antes de implementar el diseño final:

- Paleta de colores.
- Tipografías.
- Bordes.
- Sombras.
- Transparencias.
- Animaciones.
- Jerarquía visual.
- Estados de éxito y error.
- Diseño de tarjetas.
- Diseño de notificaciones.
- Diseño de solicitudes de permiso.
- Diseño de código y diffs.
- Diseño de consola.
- Diseño de mensajes largos.
- Diseño responsive para distintos tamaños de ventana.
- Accesibilidad y contraste.
- Reducción de movimiento.
- Modo oscuro y posibles temas.
- Diferencias visuales entre FULL, COMPANION y PET.
- Indicadores de atención para el modo Pet.
- Estados visuales cuando la ventana no puede recibir foco.

La estética anime no debe sacrificar legibilidad, especialmente en código, errores, comandos y permisos.

---

# CATÁLOGO GRANDE DE REACCIONES DEL AVATAR

Antes de implementar el motor de personalidad, crea un catálogo amplio de reacciones.

No te limites a `idle`, `thinking`, `happy` y `error`.

Clasifica las reacciones por:

## Estado mental

- Neutral.
- Concentrada.
- Pensativa.
- Analizando.
- Confundida.
- Dudosa.
- Sorprendida.
- Alarmada.
- Preocupada.
- Cansada.
- Aliviada.
- Satisfecha.
- Entusiasmada.
- Orgullosa.
- Curiosa.
- Impaciente.
- Esperando.
- Dormida.
- Despertando.

## Actividad técnica

- Leyendo archivos.
- Explorando el proyecto.
- Buscando referencias.
- Analizando dependencias.
- Planificando.
- Escribiendo código.
- Modificando código.
- Eliminando código.
- Ejecutando comandos.
- Ejecutando pruebas.
- Compilando.
- Instalando dependencias.
- Revisando errores.
- Comparando cambios.
- Generando un diff.
- Esperando una herramienta.
- Esperando permisos.
- Reintentando.
- Recuperándose de un error.

## Resultado

- Operación exitosa.
- Pruebas exitosas.
- Compilación exitosa.
- Cambio aplicado.
- Advertencia.
- Error recuperable.
- Error grave.
- Comando rechazado.
- Permiso concedido.
- Permiso denegado.
- Sesión cancelada.
- Sesión finalizada.
- Resultado parcial.
- Resultado ambiguo.

## Interacción con el usuario

- Recibiendo instrucción.
- No entendió la instrucción.
- Necesita aclaración.
- Esperando respuesta.
- Mostrando opciones.
- Recibiendo una respuesta.
- Agradeciendo.
- Confirmando una decisión.
- Advirtiendo sobre un riesgo.
- Pidiendo permiso.
- Celebrando una solución.

## Reacciones de presentación

- Parpadeo.
- Respiración.
- Movimiento leve de cabeza.
- Mirada hacia el panel de actividad.
- Mirada hacia el chat.
- Señalar una tarjeta.
- Sacar una notificación.
- Mostrar un icono de alerta.
- Mostrar un icono de éxito.
- Cambiar iluminación.
- Cambiar fondo.
- Mostrar partículas sutiles.
- Mostrar efecto de escritura.
- Mostrar efecto de carga.
- Mostrar transición de escena.
- Mostrar una señal de atención en modo Pet.
- Mostrar una burbuja de interacción pendiente.
- Animar el avatar sin robar el foco.
- Reaccionar al clic que restaura la interfaz.

Para cada reacción define:

```typescript
interface AvatarReactionDefinition {
  id: string;
  triggers: ClaudeEventType[];
  priority: number;
  durationMs?: number;
  expression?: AvatarExpression;
  state?: AvatarState;
  animation?: string;
  speechPolicy: "never" | "optional" | "recommended" | "required";
  cooldownMs?: number;
  interruptible: boolean;
  fallback?: string;
}
```

No todas las reacciones deben hablar.

No todas las reacciones deben ser visualmente intensas.

Implementa prioridades, cooldowns, agrupación y deduplicación para evitar una experiencia molesta.

Las reacciones de atención deben tener prioridad suficiente para que el usuario detecte una solicitud pendiente incluso cuando el avatar esté en modo Pet.

---

# INVESTIGACIÓN Y SELECCIÓN DEL AVATAR VTUBER

Antes de elegir o descargar un avatar, investiga opciones reales en internet.

Busca avatares y sistemas compatibles con:

- Live2D.
- VRM.
- VRoid.
- Spine.
- Sprites 2D.
- Modelos 3D.
- Integración web.
- Integración con Tauri.
- Control programático de expresiones.
- Control programático de animaciones.
- Control de boca.
- Control de ojos.
- Control de cejas.
- Control de poses.
- Control de estados.
- Sincronización con audio.
- Licencias de uso comercial y distribución.
- Redistribución dentro de una aplicación.
- Necesidad de atribución.
- Restricciones de modificación.
- Restricciones de uso con IA.
- Compatibilidad con Windows, macOS y Linux.
- Rendimiento.
- Tamaño del modelo.
- Dependencias nativas.
- Soporte de transparencia y ventana flotante.