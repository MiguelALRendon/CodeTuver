import type { NormalizedEvent } from './claude-transport';
import type { AvatarExpression, AvatarState } from './avatar-controller';

export type ClaudeEventType = NormalizedEvent['type'];

export const VALID_CLAUDE_EVENT_TYPES: ClaudeEventType[] = [
  'session_started',
  'session_finished',
  'assistant_message',
  'thinking',
  'file_read',
  'file_modified',
  'command_started',
  'tool_started',
  'tool_finished',
  'interaction_required',
  'permission_denied',
  'unclassified',
  'assistant_turn_complete',
];

export type SpeechPolicy = 'never' | 'optional' | 'recommended' | 'required';

export interface AvatarReactionDefinition {
  id: string;
  triggers: ClaudeEventType[];
  priority: number;
  durationMs?: number;
  expression?: AvatarExpression;
  state?: AvatarState;
  // Eje de presentacion (PRESENTATION_REACTIONS, disparo por evento discreto) — no es el pool de StateAssignment.animations (ADR-0011).
  animation?: string;
  speechPolicy: SpeechPolicy;
  // Funcion: la respuesta hablada del Hito 6 no conoce su texto hasta que llega el evento sintetico.
  phrase?: string | ((event: NormalizedEvent) => string);
  cooldownMs?: number;
  interruptible: boolean;
  fallback?: string;
}

// Eje "Estado mental" (avatar-reacciones-voz.md linea 84, 19 entradas).
const MENTAL_STATE_REACTIONS: AvatarReactionDefinition[] = [
  {
    id: 'mental-neutral',
    triggers: [],
    priority: 5,
    expression: 'neutral',
    state: 'idle',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Estado base de reposo; es el punto de partida antes de cualquier reaccion, no requiere evento propio.',
  },
  {
    id: 'mental-concentrada',
    triggers: ['tool_started'],
    priority: 20,
    expression: 'neutral',
    state: 'concentrada',
    speechPolicy: 'never',
    cooldownMs: 4000,
    interruptible: true,
    fallback:
      'Comparte tool_started con tecnica-explorando-el-proyecto (32), que siempre gana por prioridad; nunca visible en el catalogo real.',
  },
  {
    id: 'mental-pensativa',
    triggers: ['thinking'],
    priority: 15,
    expression: 'neutral',
    state: 'pensativa',
    speechPolicy: 'never',
    cooldownMs: 4000,
    interruptible: true,
    fallback:
      'Comparte thinking con tecnica-planificando (20), que siempre gana por prioridad; nunca visible en el catalogo real.',
  },
  {
    id: 'mental-analizando',
    triggers: [],
    priority: 15,
    expression: 'neutral',
    state: 'analizando',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Se infiere de una secuencia sostenida de thinking/tool_started, no de un evento discreto propio.',
  },
  {
    id: 'mental-confundida',
    triggers: [],
    priority: 25,
    expression: 'confused',
    state: 'confundida',
    speechPolicy: 'optional',
    cooldownMs: 5000,
    interruptible: true,
    fallback:
      'unclassified ya no dispara esta reaccion (ruido de infraestructura/hooks no es "el agente no entendio"); sin evento propio de confusion real del agente.',
  },
  {
    id: 'mental-dudosa',
    triggers: [],
    priority: 15,
    expression: 'confused',
    state: 'dudosa',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Variante mas suave de mental-confundida; sin evento propio que la distinga de ella.',
  },
  {
    id: 'mental-sorprendida',
    triggers: ['interaction_required'],
    priority: 20,
    expression: 'surprised',
    state: 'sorprendida',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Comparte interaction_required con 3 reacciones de mayor prioridad (interaccion-pidiendo-permiso 95, tecnica-esperando-permisos 92, interaccion-necesita-aclaracion 85); nunca gana en el catalogo real.',
  },
  {
    id: 'mental-alarmada',
    triggers: ['permission_denied'],
    priority: 59,
    durationMs: 4000,
    expression: 'surprised',
    state: 'alarmada',
    speechPolicy: 'never',
    interruptible: true,
  },
  {
    id: 'mental-preocupada',
    triggers: [],
    priority: 25,
    expression: 'sad',
    state: 'preocupada',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Misma brecha que mental-alarmada: depende de severidad, no de tipo de evento.',
  },
  {
    id: 'mental-cansada',
    triggers: [],
    priority: 10,
    expression: 'tired',
    state: 'cansada',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Ambiental por duracion de sesion, no por evento discreto; fuera de alcance de este Hito.',
  },
  {
    id: 'mental-aliviada',
    triggers: [],
    priority: 20,
    expression: 'happy',
    state: 'aliviada',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Depende de exito tras un fallo previo (payload success de tool_finished), no expresable por tipo de evento solo.',
  },
  {
    id: 'mental-satisfecha',
    triggers: [],
    priority: 20,
    expression: 'happy',
    state: 'satisfecha',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Misma brecha que mental-aliviada: depende del payload success, no del tipo.',
  },
  {
    id: 'mental-entusiasmada',
    triggers: [],
    priority: 15,
    expression: 'excited',
    state: 'entusiasmada',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Ambiental; no hay evento discreto que distinga entusiasmo de exito simple.',
  },
  {
    id: 'mental-orgullosa',
    triggers: [],
    priority: 15,
    expression: 'happy',
    state: 'orgullosa',
    speechPolicy: 'never',
    interruptible: true,
    fallback: 'Ambiental, sin evento propio.',
  },
  {
    id: 'mental-curiosa',
    triggers: ['file_read'],
    priority: 10,
    expression: 'neutral',
    state: 'curiosa',
    speechPolicy: 'never',
    cooldownMs: 4000,
    interruptible: true,
    fallback:
      'Comparte file_read con tecnica-leyendo-archivos (prioridad 30); casi siempre pierde por prioridad y queda como variante de humor documentada.',
  },
  {
    id: 'mental-impaciente',
    triggers: [],
    priority: 15,
    expression: 'neutral',
    state: 'impaciente',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Se asociaria a esperas largas medidas por temporizador, no por evento.',
  },
  {
    id: 'mental-esperando',
    triggers: [],
    priority: 15,
    expression: 'neutral',
    state: 'esperando',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Version generica de interaccion-esperando-respuesta y tecnica-esperando-permisos; sin evento propio.',
  },
  {
    id: 'mental-dormida',
    triggers: ['session_finished'],
    priority: 20,
    durationMs: 4000,
    expression: 'tired',
    state: 'sleeping',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Comparte session_finished con resultado-sesion-finalizada (prioridad 45), que gana en la practica.',
  },
  {
    id: 'mental-despertando',
    triggers: ['session_started'],
    priority: 20,
    expression: 'neutral',
    state: 'despertando',
    speechPolicy: 'optional',
    interruptible: true,
  },
];

// Eje "Actividad tecnica" (avatar-reacciones-voz.md linea 86, etiquetado "18" pero enumera 19 items literales; se transcriben los 19).
const TECHNICAL_ACTIVITY_REACTIONS: AvatarReactionDefinition[] = [
  {
    id: 'tecnica-leyendo-archivos',
    triggers: ['file_read'],
    priority: 30,
    expression: 'neutral',
    state: 'reading',
    speechPolicy: 'never',
    cooldownMs: 3000,
    interruptible: true,
  },
  {
    id: 'tecnica-explorando-el-proyecto',
    triggers: ['tool_started'],
    priority: 32,
    expression: 'neutral',
    state: 'explorando',
    speechPolicy: 'never',
    cooldownMs: 3000,
    interruptible: true,
  },
  {
    id: 'tecnica-buscando-referencias',
    triggers: ['tool_started'],
    priority: 26,
    expression: 'neutral',
    state: 'buscando-referencias',
    speechPolicy: 'never',
    cooldownMs: 3000,
    interruptible: true,
    fallback:
      'tool_started no distingue Grep de Glob de otras herramientas por tipo (solo por el campo name, fuera de lo que triggers filtra); suele perder frente a tecnica-explorando-el-proyecto.',
  },
  {
    id: 'tecnica-analizando-dependencias',
    triggers: ['tool_started'],
    priority: 18,
    expression: 'neutral',
    state: 'analizando-dependencias',
    speechPolicy: 'never',
    cooldownMs: 3000,
    interruptible: true,
    fallback:
      'Misma limitacion de tool_started generico que tecnica-buscando-referencias.',
  },
  {
    id: 'tecnica-planificando',
    triggers: ['thinking'],
    priority: 20,
    expression: 'neutral',
    state: 'planificando',
    speechPolicy: 'never',
    cooldownMs: 3000,
    interruptible: true,
  },
  {
    id: 'tecnica-escribiendo-codigo',
    triggers: ['file_modified'],
    priority: 30,
    expression: 'neutral',
    state: 'coding',
    speechPolicy: 'never',
    cooldownMs: 3000,
    interruptible: true,
    fallback:
      'file_modified no distingue creacion de edicion; compite con resultado-cambio-aplicado (40) y tecnica-modificando-codigo (35) por el mismo evento.',
  },
  {
    id: 'tecnica-modificando-codigo',
    triggers: ['file_modified'],
    priority: 35,
    expression: 'neutral',
    state: 'coding',
    speechPolicy: 'never',
    cooldownMs: 3000,
    interruptible: true,
    fallback:
      'Comparte file_modified con resultado-cambio-aplicado (40), que siempre gana por prioridad; nunca visible en el catalogo real.',
  },
  {
    id: 'tecnica-eliminando-codigo',
    triggers: ['file_modified'],
    priority: 25,
    expression: 'neutral',
    state: 'eliminando-codigo',
    speechPolicy: 'never',
    cooldownMs: 3000,
    interruptible: true,
    fallback:
      'file_modified no distingue creacion/edicion/eliminacion por path; suele perder frente a tecnica-modificando-codigo.',
  },
  {
    id: 'tecnica-ejecutando-comandos',
    triggers: ['command_started'],
    priority: 30,
    expression: 'neutral',
    state: 'executing',
    speechPolicy: 'never',
    cooldownMs: 3000,
    interruptible: true,
  },
  {
    id: 'tecnica-ejecutando-pruebas',
    triggers: ['command_started'],
    priority: 28,
    expression: 'neutral',
    state: 'ejecutando-pruebas',
    speechPolicy: 'never',
    cooldownMs: 3000,
    interruptible: true,
    fallback:
      'command_started no distingue un comando de pruebas de cualquier otro; suele perder frente a tecnica-ejecutando-comandos.',
  },
  {
    id: 'tecnica-compilando',
    triggers: ['command_started'],
    priority: 26,
    expression: 'neutral',
    state: 'compilando',
    speechPolicy: 'never',
    cooldownMs: 3000,
    interruptible: true,
    fallback: 'Misma limitacion que tecnica-ejecutando-pruebas.',
  },
  {
    id: 'tecnica-instalando-dependencias',
    triggers: ['command_started'],
    priority: 24,
    expression: 'neutral',
    state: 'instalando-dependencias',
    speechPolicy: 'never',
    cooldownMs: 3000,
    interruptible: true,
    fallback: 'Misma limitacion que tecnica-ejecutando-pruebas.',
  },
  {
    id: 'tecnica-revisando-errores',
    triggers: ['tool_started'],
    priority: 22,
    expression: 'neutral',
    state: 'revisando-errores',
    speechPolicy: 'never',
    cooldownMs: 3000,
    interruptible: true,
    fallback:
      'Misma limitacion de tool_started generico que tecnica-buscando-referencias.',
  },
  {
    id: 'tecnica-comparando-cambios',
    triggers: ['tool_started'],
    priority: 16,
    expression: 'neutral',
    state: 'comparando-cambios',
    speechPolicy: 'never',
    cooldownMs: 3000,
    interruptible: true,
    fallback: 'Misma limitacion de tool_started generico.',
  },
  {
    id: 'tecnica-generando-un-diff',
    triggers: ['tool_started'],
    priority: 14,
    expression: 'neutral',
    state: 'generando-diff',
    speechPolicy: 'never',
    cooldownMs: 3000,
    interruptible: true,
    fallback: 'Misma limitacion de tool_started generico.',
  },
  {
    id: 'tecnica-esperando-una-herramienta',
    triggers: [],
    priority: 10,
    expression: 'neutral',
    state: 'esperando-herramienta',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'No existe evento de "a punto de ejecutar"; tool_started ya significa que la herramienta arranco, no que se espera.',
  },
  {
    id: 'tecnica-esperando-permisos',
    triggers: ['interaction_required'],
    priority: 92,
    expression: 'neutral',
    state: 'waiting_permission',
    speechPolicy: 'recommended',
    phrase: 'Estoy esperando que autorices este paso para continuar.',
    interruptible: false,
    fallback:
      'Comparte interaction_required con interaccion-pidiendo-permiso (95); pierde por poco, decision de framing deliberada (interpersonal sobre tecnico).',
  },
  {
    id: 'tecnica-reintentando',
    triggers: [],
    priority: 12,
    expression: 'neutral',
    state: 'reintentando',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'command_started no distingue un primer intento de un reintento; no hay contador de intentos en el contrato de eventos.',
  },
  {
    id: 'tecnica-recuperandose-de-un-error',
    triggers: [],
    priority: 20,
    expression: 'sad',
    state: 'recuperandose-de-error',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Se infiere de un tool_finished exitoso justo despues de uno fallido; correlacion entre eventos fuera de alcance de este Hito.',
  },
];

// Eje "Resultado" (avatar-reacciones-voz.md linea 88, 14 entradas).
const RESULT_REACTIONS: AvatarReactionDefinition[] = [
  {
    id: 'resultado-operacion-exitosa',
    triggers: ['tool_finished'],
    priority: 60,
    durationMs: 5000,
    expression: 'happy',
    state: 'success',
    speechPolicy: 'optional',
    cooldownMs: 4000,
    interruptible: true,
    fallback:
      'Rama "exito" de la tabla de desempate por resultado del motor (event.success), no de triggers por tipo.',
  },
  {
    id: 'resultado-pruebas-exitosas',
    triggers: [],
    priority: 55,
    expression: 'happy',
    state: 'pruebas-exitosas',
    speechPolicy: 'optional',
    interruptible: true,
    fallback:
      'tool_finished no distingue un comando de pruebas de otro exitoso; requeriria inspeccionar el comando ejecutado.',
  },
  {
    id: 'resultado-compilacion-exitosa',
    triggers: [],
    priority: 55,
    expression: 'happy',
    state: 'compilacion-exitosa',
    speechPolicy: 'optional',
    interruptible: true,
    fallback: 'Misma limitacion que resultado-pruebas-exitosas.',
  },
  {
    id: 'resultado-cambio-aplicado',
    triggers: ['file_modified'],
    priority: 40,
    durationMs: 4000,
    expression: 'happy',
    state: 'cambio-aplicado',
    speechPolicy: 'never',
    cooldownMs: 3000,
    interruptible: true,
  },
  {
    id: 'resultado-advertencia',
    triggers: [],
    priority: 45,
    expression: 'neutral',
    state: 'advertencia',
    speechPolicy: 'optional',
    interruptible: true,
    fallback:
      'Ninguno de los 12 eventos reales representa una advertencia distinta de un fallo; requeriria un tipo de evento propio que no existe hoy.',
  },
  {
    id: 'resultado-error-recuperable',
    triggers: ['tool_finished'],
    priority: 58,
    durationMs: 5000,
    expression: 'sad',
    state: 'error-recuperable',
    speechPolicy: 'optional',
    cooldownMs: 4000,
    interruptible: true,
    fallback:
      'Rama "fallo" de la misma tabla de desempate que resultado-operacion-exitosa.',
  },
  {
    id: 'resultado-error-grave',
    triggers: [],
    priority: 85,
    expression: 'angry',
    state: 'error-grave',
    speechPolicy: 'recommended',
    phrase: 'Algo salio mal y necesito que lo revises.',
    interruptible: false,
    fallback:
      'No existe un evento "error" propio entre los 12 reales (el plan asumia uno que no llego a implementarse en EPIC-002); distinguir "grave" de "recuperable" exige severidad de payload ausente hoy.',
  },
  {
    id: 'resultado-comando-rechazado',
    triggers: [],
    priority: 50,
    expression: 'sad',
    state: 'comando-rechazado',
    speechPolicy: 'optional',
    interruptible: true,
    fallback:
      'tool_finished con success:false no distingue "rechazado" de cualquier otro fallo.',
  },
  {
    id: 'resultado-permiso-concedido',
    triggers: [],
    priority: 40,
    expression: 'happy',
    state: 'permiso-concedido',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'La resolucion de una peticion de permiso es una llamada saliente (respondToPermissionRequest), no llega como NormalizedEvent.',
  },
  {
    id: 'resultado-permiso-denegado',
    triggers: [],
    priority: 40,
    expression: 'sad',
    state: 'permiso-denegado',
    speechPolicy: 'never',
    interruptible: true,
    fallback: 'Misma razon que resultado-permiso-concedido.',
  },
  {
    id: 'resultado-sesion-cancelada',
    triggers: [],
    priority: 35,
    expression: 'sad',
    state: 'sesion-cancelada',
    speechPolicy: 'optional',
    interruptible: true,
    fallback:
      'session_finished no distingue cancelacion de cierre normal sin leer stop_reason, que triggers (solo tipo) no puede expresar.',
  },
  {
    id: 'resultado-sesion-finalizada',
    triggers: ['session_finished'],
    priority: 45,
    durationMs: 4000,
    expression: 'neutral',
    state: 'sleeping',
    speechPolicy: 'optional',
    interruptible: true,
  },
  {
    id: 'resultado-resultado-parcial',
    triggers: [],
    priority: 30,
    expression: 'neutral',
    state: 'resultado-parcial',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Ambiguo por diseño: la consola es la fuente de verdad para resultados parciales (research/avatar-and-tts.md, eje Resultado); el avatar no lo comunica por evento propio.',
  },
  {
    id: 'resultado-resultado-ambiguo',
    triggers: [],
    priority: 30,
    expression: 'neutral',
    state: 'resultado-ambiguo',
    speechPolicy: 'never',
    interruptible: true,
    fallback: 'Misma razon que resultado-resultado-parcial.',
  },
];

// Eje "Interaccion con el usuario" (avatar-reacciones-voz.md linea 90, 11 entradas).
const USER_INTERACTION_REACTIONS: AvatarReactionDefinition[] = [
  {
    id: 'interaccion-recibiendo-instruccion',
    triggers: [],
    priority: 15,
    expression: 'neutral',
    state: 'recibiendo-instruccion',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'No hay evento que confirme la recepcion; el primer evento real tras enviar una instruccion suele ser thinking o assistant_message, ya cubiertos por otras entradas.',
  },
  {
    id: 'interaccion-no-entendio-la-instruccion',
    triggers: [],
    priority: 40,
    expression: 'confused',
    state: 'no-entendio',
    speechPolicy: 'optional',
    cooldownMs: 3000,
    interruptible: true,
    fallback:
      'unclassified ya no dispara esta reaccion (Hallazgo 1): "no entendi" debe reservarse para cuando el agente no entiende una instruccion real del usuario, no para ruido de infraestructura (hooks u otros subtypes de sistema no reconocidos).',
  },
  {
    id: 'interaccion-necesita-aclaracion',
    triggers: ['interaction_required'],
    priority: 85,
    expression: 'confused',
    state: 'necesita-aclaracion',
    speechPolicy: 'recommended',
    phrase: 'No estoy segura de haber entendido, me lo puedes aclarar?',
    interruptible: true,
    fallback:
      'Comparte interaction_required con interaccion-pidiendo-permiso (95) y tecnica-esperando-permisos (92); pierde siempre por prioridad pese a estar semanticamente mas cerca de "no entendi" que de "permiso".',
  },
  {
    id: 'interaccion-esperando-respuesta',
    triggers: [],
    priority: 20,
    expression: 'neutral',
    state: 'esperando-respuesta',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Estado sostenido tras interaction_required, no un evento nuevo; el motor no recibe una senal de "sigo esperando".',
  },
  {
    id: 'interaccion-mostrando-opciones',
    triggers: [],
    priority: 20,
    expression: 'neutral',
    state: 'mostrando-opciones',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'El NormalizedEvent interaction_required es generico (solo trae texto); la variante "choice" vive en el canal InteractionRequest (onPermissionPending), fuera del vocabulario de eventos que consume este Hito.',
  },
  {
    id: 'interaccion-recibiendo-una-respuesta',
    triggers: [],
    priority: 15,
    expression: 'neutral',
    state: 'recibiendo-respuesta',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'La resolucion de una peticion es una llamada saliente (respondToPermissionRequest), no un NormalizedEvent entrante.',
  },
  {
    id: 'interaccion-agradeciendo',
    triggers: [],
    priority: 10,
    expression: 'happy',
    state: 'agradeciendo',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Depende del contenido semantico del mensaje, no de su tipo; interpretar contenido es logica de IA, fuera de ADR-0003.',
  },
  {
    id: 'interaccion-confirmando-una-decision',
    triggers: [],
    priority: 10,
    expression: 'neutral',
    state: 'confirmando-decision',
    speechPolicy: 'never',
    interruptible: true,
    fallback: 'Misma razon que interaccion-agradeciendo.',
  },
  {
    id: 'interaccion-advirtiendo-sobre-un-riesgo',
    triggers: ['interaction_required'],
    priority: 80,
    expression: 'surprised',
    state: 'advirtiendo-riesgo',
    speechPolicy: 'recommended',
    phrase: 'Antes de seguir, quiero advertirte de un riesgo en esto.',
    interruptible: true,
    fallback:
      'Comparte interaction_required con 3 reacciones de mayor prioridad (95/92/85); nunca gana en el catalogo real, aunque semanticamente distinta.',
  },
  {
    id: 'interaccion-pidiendo-permiso',
    triggers: ['interaction_required'],
    priority: 95,
    expression: 'surprised',
    state: 'waiting_permission',
    speechPolicy: 'required',
    phrase: 'Necesito tu autorizacion para continuar.',
    interruptible: false,
  },
  {
    id: 'interaccion-celebrando-una-solucion',
    triggers: [],
    priority: 35,
    expression: 'excited',
    state: 'celebrando',
    speechPolicy: 'optional',
    interruptible: true,
    fallback:
      'Depende de exito confirmado (payload success); misma brecha que las entradas de exito del eje Resultado.',
  },
];

// Eje "Presentacion" (avatar-reacciones-voz.md linea 92, etiquetado "18" pero enumera 19 items literales; se transcriben los 19).
const PRESENTATION_REACTIONS: AvatarReactionDefinition[] = [
  {
    id: 'presentacion-parpadeo',
    triggers: [],
    priority: 2,
    animation: 'blink',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Ambiental por temporizador propio (frecuencia natural de parpadeo); no dispara con NormalizedEvent, fuera de alcance de este Hito.',
  },
  {
    id: 'presentacion-respiracion',
    triggers: [],
    priority: 2,
    animation: 'breathe',
    speechPolicy: 'never',
    interruptible: true,
    fallback: 'Misma razon que presentacion-parpadeo.',
  },
  {
    id: 'presentacion-movimiento-leve-de-cabeza',
    triggers: [],
    priority: 2,
    animation: 'head-tilt',
    speechPolicy: 'never',
    interruptible: true,
    fallback: 'Ambiental, sin evento propio.',
  },
  {
    id: 'presentacion-mirada-hacia-el-panel-de-actividad',
    triggers: [],
    priority: 3,
    animation: 'look-activity-panel',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Matiz de presentacion sin evento propio dedicado; se deja sin disparador para no inventarlo.',
  },
  {
    id: 'presentacion-mirada-hacia-el-chat',
    triggers: [],
    priority: 3,
    animation: 'look-chat',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Misma razon que presentacion-mirada-hacia-el-panel-de-actividad.',
  },
  {
    id: 'presentacion-senalar-una-tarjeta',
    triggers: [],
    priority: 3,
    animation: 'point-card',
    speechPolicy: 'never',
    interruptible: true,
    fallback: 'Ambiental/UI, sin evento propio.',
  },
  {
    id: 'presentacion-sacar-una-notificacion',
    triggers: [],
    priority: 4,
    animation: 'show-notification',
    speechPolicy: 'never',
    interruptible: true,
    fallback: 'Ambiental/UI, sin evento propio.',
  },
  {
    id: 'presentacion-icono-de-alerta',
    triggers: [],
    priority: 4,
    durationMs: 1500,
    animation: 'icon-alert',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Depende de severidad del resultado (payload); misma brecha que el eje Resultado.',
  },
  {
    id: 'presentacion-icono-de-exito',
    triggers: [],
    priority: 4,
    durationMs: 1500,
    animation: 'icon-success',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Depende de exito (payload success); misma brecha que el eje Resultado.',
  },
  {
    id: 'presentacion-cambiar-iluminacion',
    triggers: [],
    priority: 2,
    animation: 'change-lighting',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Efecto de escena del renderizador, no del avatar (research/avatar-and-tts.md, eje Presentacion); ademas ambiental, sin evento propio.',
  },
  {
    id: 'presentacion-cambiar-fondo',
    triggers: [],
    priority: 2,
    animation: 'change-background',
    speechPolicy: 'never',
    interruptible: true,
    fallback: 'Misma razon que presentacion-cambiar-iluminacion.',
  },
  {
    id: 'presentacion-particulas-sutiles',
    triggers: [],
    priority: 2,
    animation: 'particles-subtle',
    speechPolicy: 'never',
    interruptible: true,
    fallback: 'Efecto de renderizador, ambiental, sin evento propio.',
  },
  {
    id: 'presentacion-efecto-de-escritura',
    triggers: ['assistant_message'],
    priority: 30,
    animation: 'typing',
    speechPolicy: 'never',
    cooldownMs: 1500,
    interruptible: true,
  },
  {
    id: 'presentacion-efecto-de-carga',
    triggers: ['tool_started', 'command_started'],
    priority: 12,
    animation: 'loading-spin',
    speechPolicy: 'never',
    cooldownMs: 2000,
    interruptible: true,
    fallback:
      'Comparte tool_started/command_started con reacciones tecnicas de mayor prioridad (32/30 respectivamente); nunca gana en el catalogo real.',
  },
  {
    id: 'presentacion-transicion-de-escena',
    triggers: [],
    priority: 2,
    animation: 'scene-transition',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Se dispara al cambiar de personaje/pantalla, evento de UI ajeno a NormalizedEvent.',
  },
  {
    id: 'presentacion-senal-de-atencion-en-modo-mascota',
    triggers: [],
    priority: 3,
    animation: 'pet-mode-attention',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Por la regla del paso 2.5 el motor nunca consulta el modo activo; solo la capa de presentacion (fuera de este Hito) puede activar esta entrada.',
  },
  {
    id: 'presentacion-burbuja-de-interaccion-pendiente',
    triggers: ['interaction_required'],
    priority: 5,
    animation: 'pending-bubble',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Prioridad deliberadamente baja: acompaña a interaccion-pidiendo-permiso (95), nunca la reemplaza.',
  },
  {
    id: 'presentacion-animar-sin-robar-el-foco',
    triggers: [],
    priority: 1,
    animation: 'ambient-no-focus-steal',
    speechPolicy: 'never',
    interruptible: true,
    fallback: 'Ambiental por diseño, sin evento propio.',
  },
  {
    id: 'presentacion-reaccionar-al-clic-que-restaura-la-interfaz',
    triggers: [],
    priority: 1,
    animation: 'restore-click-react',
    speechPolicy: 'never',
    interruptible: true,
    fallback:
      'Es un handler de clic de UI, no un NormalizedEvent; no existe entre los 12 tipos reales.',
  },
];

const SPOKEN_RESPONSE_REACTIONS: AvatarReactionDefinition[] = [
  {
    id: 'respuesta-hablada',
    triggers: ['assistant_turn_complete'],
    priority: 65,
    durationMs: 3000,
    speechPolicy: 'recommended',
    phrase: (event) =>
      event.type === 'assistant_turn_complete' ? event.text : '',
    interruptible: true,
  },
];

export const REACTION_CATALOG: AvatarReactionDefinition[] = [
  ...MENTAL_STATE_REACTIONS,
  ...TECHNICAL_ACTIVITY_REACTIONS,
  ...RESULT_REACTIONS,
  ...USER_INTERACTION_REACTIONS,
  ...PRESENTATION_REACTIONS,
  ...SPOKEN_RESPONSE_REACTIONS,
];

export function validateCatalog(catalog: AvatarReactionDefinition[]): string[] {
  const validTypes = new Set<string>(VALID_CLAUDE_EVENT_TYPES);
  return catalog
    .filter((reaction) =>
      reaction.triggers.some((trigger) => !validTypes.has(trigger)),
    )
    .map((reaction) => reaction.id);
}
