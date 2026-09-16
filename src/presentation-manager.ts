import { reactive } from 'vue';
import type {
  DesktopWindowManager,
  PresentationMode,
  WindowPosition,
  WindowSize,
} from './desktop-window-manager';
import { calculateCornerPosition, type ScreenCorner } from './monitor-position';
import { registerFailure } from './failure-taxonomy';
import { errorMessage } from './error-message';
import type { PetWindowPosition } from './pet-window-position';

export type PanelVisibility = 'VISIBLE' | 'HIDDEN';
export type AvatarPosition = 'CENTER' | 'CORNER';

export interface PresentationWindowFlags {
  transparent: boolean;
  borderless: boolean;
  resizable: boolean;
  alwaysOnTop: boolean;
  focusable: boolean;
  ignoreMouseEvents: boolean;
}

export interface PresentationState {
  mode: PresentationMode;
  activityVisibility: PanelVisibility;
  avatarPosition: AvatarPosition;
  window: PresentationWindowFlags;
  pendingInteractionCount: number;
  isTransitioning: boolean;
}

export type PresentationTransitionGesture =
  | 'ocultar chat'
  | 'enviar al escritorio'
  | 'click en VTuber'
  | 'volver a la interfaz completa'
  | 'cambio directo de modo';

export interface PresentationTransition {
  from: PresentationMode;
  to: PresentationMode;
  gesture: PresentationTransitionGesture;
}

// presentacion-y-ventana.md:85-87 solo dibuja 3; TC-068 exige las 6 en ambos sentidos (AC-023.4).
export const PRESENTATION_TRANSITIONS: readonly PresentationTransition[] = [
  { from: 'FULL', to: 'COMPANION', gesture: 'ocultar chat' },
  { from: 'COMPANION', to: 'PET', gesture: 'enviar al escritorio' },
  { from: 'PET', to: 'FULL', gesture: 'click en VTuber' },
  { from: 'COMPANION', to: 'FULL', gesture: 'volver a la interfaz completa' },
  { from: 'FULL', to: 'PET', gesture: 'cambio directo de modo' },
  { from: 'PET', to: 'COMPANION', gesture: 'cambio directo de modo' },
];

interface PanelVisibilitySnapshot {
  activityVisibility: PanelVisibility;
}

interface ModeProfile {
  avatarPosition: AvatarPosition;
  window: PresentationWindowFlags;
}

const DEFAULT_PANELS: PanelVisibilitySnapshot = {
  activityVisibility: 'VISIBLE',
};

const HIDDEN_PANELS: PanelVisibilitySnapshot = {
  activityVisibility: 'HIDDEN',
};

// Defaults de arranque hasta que applyPersistedSettings los sobrescriba (mismos valores que AppSettings::default() en app_settings.rs); exportadas para que el panel de depuracion calcule la misma posicion diagnostica.
export const PET_WINDOW_SIZE: WindowSize = { width: 200, height: 200 };
export const PET_WINDOW_MARGIN = 20;
export const PET_WINDOW_CORNER: ScreenCorner = 'bottom-right';

const LAST_RESORT_WINDOW_FLAGS: PresentationWindowFlags = {
  transparent: false,
  borderless: false,
  resizable: true,
  alwaysOnTop: false,
  focusable: true,
  ignoreMouseEvents: false,
};

// FULL comparte espacio con chat/actividad/controles: mas cerca de CORNER que del protagonismo exclusivo de COMPANION=CENTER.
const MODE_PROFILES: Record<PresentationMode, ModeProfile> = {
  FULL: {
    avatarPosition: 'CORNER',
    window: {
      transparent: false,
      borderless: false,
      resizable: true,
      alwaysOnTop: false,
      focusable: true,
      ignoreMouseEvents: false,
    },
  },
  COMPANION: {
    avatarPosition: 'CENTER',
    window: {
      transparent: false,
      borderless: false,
      resizable: true,
      alwaysOnTop: false,
      focusable: true,
      ignoreMouseEvents: false,
    },
  },
  // false a proposito: Tauri no soporta click-through solo-avatar (Hito 1); la ventana en PET es del tamano del avatar, capturar todo el clic ES "clic en VTuber restaura FULL".
  PET: {
    avatarPosition: 'CORNER',
    window: {
      transparent: true,
      borderless: true,
      resizable: false,
      alwaysOnTop: true,
      focusable: false,
      ignoreMouseEvents: false,
    },
  },
};

export type PresentationErrorKind = 'invalid-transition' | 'transition-failed';

export interface PresentationError {
  kind: PresentationErrorKind;
  mode: PresentationMode;
  message: string;
}

function invalidTransitionFault(
  from: PresentationMode,
  to: PresentationMode,
): PresentationError {
  return {
    kind: 'invalid-transition',
    mode: to,
    message: `transicion no valida: ${from} -> ${to}`,
  };
}

function transitionFailedFault(
  mode: PresentationMode,
  message: string,
): PresentationError {
  return { kind: 'transition-failed', mode, message };
}

function findTransition(
  from: PresentationMode,
  to: PresentationMode,
): PresentationTransition | undefined {
  return PRESENTATION_TRANSITIONS.find((t) => t.from === from && t.to === to);
}

function resolvePanelVisibility(
  mode: PresentationMode,
  snapshot: PanelVisibilitySnapshot | null,
): PanelVisibilitySnapshot {
  if (mode !== 'FULL') return HIDDEN_PANELS;
  return snapshot ?? DEFAULT_PANELS;
}

// "siempre encima" solo tiene sentido como preferencia de usuario en modo mascota (PET); FULL/COMPANION son ventanas normales de trabajo.
function resolveWindowFlags(
  mode: PresentationMode,
  base: PresentationWindowFlags,
  alwaysOnTopOverride: boolean | null,
): PresentationWindowFlags {
  if (mode !== 'PET' || alwaysOnTopOverride === null) return base;
  return { ...base, alwaysOnTop: alwaysOnTopOverride };
}

function buildStateForMode(
  current: PresentationState,
  mode: PresentationMode,
  panelSnapshot: PanelVisibilitySnapshot | null,
  alwaysOnTopOverride: boolean | null,
): PresentationState {
  const profile = MODE_PROFILES[mode];
  const panels = resolvePanelVisibility(mode, panelSnapshot);
  return {
    mode,
    activityVisibility: panels.activityVisibility,
    avatarPosition: profile.avatarPosition,
    window: resolveWindowFlags(mode, profile.window, alwaysOnTopOverride),
    pendingInteractionCount: current.pendingInteractionCount,
    isTransitioning: current.isTransitioning,
  };
}

const DEFAULT_STATE: PresentationState = {
  mode: 'FULL',
  activityVisibility: 'VISIBLE',
  avatarPosition: 'CORNER',
  window: MODE_PROFILES.FULL.window,
  pendingInteractionCount: 0,
  isTransitioning: false,
};

const INJECTED_FAULT_MESSAGE = 'fallo de transicion inyectado (dev-only)';

let armedFaultMode: PresentationMode | null = null;

// paso 2.6: fallo simulado de transicion de modo, aislado a esta capa, solo en dev (TC-067).
export function armPresentationTransitionFault(
  mode: PresentationMode | null,
): void {
  if (!import.meta.env.DEV) return;
  armedFaultMode = mode;
}

function consumeTransitionFault(mode: PresentationMode): boolean {
  if (armedFaultMode !== mode) return false;
  armedFaultMode = null;
  return true;
}

export type PresentationFaultHandler = (fault: PresentationError) => void;
export type Unsubscribe = () => void;

// Subconjunto de AppSettings (app-settings.ts) que a esta capa le afecta; evita el import circular con el modulo de configuracion.
export interface PersistedPresentationSettings {
  corner: ScreenCorner;
  windowSize: WindowSize;
  alwaysOnTop: boolean;
  monitor: string;
  initialMode: PresentationMode;
  activityVisibility: PanelVisibility;
  petWindowPosition?: PetWindowPosition | null;
}

export class PresentationManager {
  private readonly state = reactive<PresentationState>({ ...DEFAULT_STATE });
  private panelSnapshot: PanelVisibilitySnapshot | null = null;
  private queue: Promise<void> = Promise.resolve();
  private readonly faultHandlers = new Set<PresentationFaultHandler>();
  private petWindowSize: WindowSize = PET_WINDOW_SIZE;
  private petWindowCorner: ScreenCorner = PET_WINDOW_CORNER;
  private petWindowPosition: PetWindowPosition | null = null;
  private petMonitorId: string | null = null;
  private alwaysOnTopOverride: boolean | null = null;

  constructor(private readonly windowManager: DesktopWindowManager) {}

  getState(): Readonly<PresentationState> {
    return this.state;
  }

  startWindowDrag(): Promise<void> {
    if (this.state.mode !== 'PET') return Promise.resolve();
    return this.windowManager.startDragging();
  }

  // AC-091: solo cambia lo que showPetWindow() usa en la proxima transicion a PET; la persistencia real vive en App.vue (mismo mecanismo que chatColumnWidthPx).
  setPetWindowSize(size: WindowSize): void {
    this.petWindowSize = size;
  }

  // Hito 8/D8: la persistencia real (disco) y la sincronizacion tras un arrastre viven en App.vue/PetView.vue; esto solo actualiza el cache en memoria que usa la proxima entrada a PET.
  setPetWindowPosition(position: PetWindowPosition | null): void {
    this.petWindowPosition = position;
  }

  // Restaurar posicion (D8 paso 3): recalcula la geometria ya mismo si PET esta activo, sin pasar por una transicion de modo (mismo modo, findTransition no aplicaria).
  async refreshPetGeometry(): Promise<void> {
    if (this.state.mode !== 'PET') return;
    await this.enterPetGeometry();
  }

  setPendingInteractionCount(count: number): void {
    if (count < 0) {
      throw new RangeError('pendingInteractionCount no puede ser negativo');
    }
    this.state.pendingInteractionCount = count;
  }

  // fuera de FULL el modo ya fuerza la visibilidad (resolvePanelVisibility); AC-023.5 solo exige restaurar lo previo a salir de FULL.
  setActivityVisibility(visibility: PanelVisibility): void {
    if (this.state.mode !== 'FULL') return;
    this.state.activityVisibility = visibility;
  }

  onTransitionFault(handler: PresentationFaultHandler): Unsubscribe {
    this.faultHandlers.add(handler);
    return () => this.faultHandlers.delete(handler);
  }

  transitionTo(mode: PresentationMode): Promise<void> {
    if (this.state.isTransitioning) return Promise.resolve();
    const next = this.queue.then(() => this.runTransition(mode));
    this.queue = next.catch(() => undefined);
    return next;
  }

  // Llamar una vez al arrancar, antes de cualquier transitionTo (AC-028.1: modo inicial/paneles/geometria de PET vienen de la config persistida en vez de DEFAULT_STATE fijo).
  applyPersistedSettings(
    settings: PersistedPresentationSettings,
  ): Promise<void> {
    const next = this.queue.then(() => this.runInitialSettings(settings));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async runInitialSettings(
    settings: PersistedPresentationSettings,
  ): Promise<void> {
    this.petWindowSize = settings.windowSize;
    this.petWindowCorner = settings.corner;
    this.petWindowPosition = settings.petWindowPosition ?? null;
    this.petMonitorId = settings.monitor === '' ? null : settings.monitor;
    this.alwaysOnTopOverride = settings.alwaysOnTop;
    const snapshot: PanelVisibilitySnapshot = {
      activityVisibility: settings.activityVisibility,
    };
    this.panelSnapshot = snapshot;
    const nextState = buildStateForMode(
      this.state,
      settings.initialMode,
      snapshot,
      this.alwaysOnTopOverride,
    );
    // La ventana real se crea siempre transparent:true (ADR-0008); sin esta llamada, si el modo inicial coincide con el default en memoria, nunca se pinta el fondo opaco de FULL/COMPANION y la ventana queda genuinamente transparente.
    await this.applyCoreStateTransition(nextState, settings.initialMode);
  }

  private async runTransition(mode: PresentationMode): Promise<void> {
    if (mode === this.state.mode) return;
    if (!findTransition(this.state.mode, mode)) {
      throw invalidTransitionFault(this.state.mode, mode);
    }
    this.state.isTransitioning = true;
    try {
      if (consumeTransitionFault(mode)) {
        await this.recoverFromFailedTransition(
          transitionFailedFault(mode, INJECTED_FAULT_MESSAGE),
        );
        return;
      }
      await this.applyOrRecover(mode);
    } finally {
      this.state.isTransitioning = false;
    }
  }

  private async applyOrRecover(mode: PresentationMode): Promise<void> {
    if (this.state.mode === 'FULL') this.snapshotPanelVisibility();
    const nextState = buildStateForMode(
      this.state,
      mode,
      this.panelSnapshot,
      this.alwaysOnTopOverride,
    );
    await this.applyCoreStateTransition(nextState, mode);
  }

  // Compartido por applyOrRecover (transiciones por gesto) y runInitialSettings (aplicacion al arrancar): mismo catch -> recoverFromFailedTransition en ambos casos, sin diferencia de comportamiento que justifique separarlos.
  private async applyCoreStateTransition(
    nextState: PresentationState,
    targetMode: PresentationMode,
  ): Promise<void> {
    try {
      await this.applyWindowState(nextState);
      Object.assign(this.state, nextState);
    } catch (error) {
      await this.recoverFromFailedTransition(
        transitionFailedFault(targetMode, errorMessage(error)),
      );
    }
  }

  private snapshotPanelVisibility(): void {
    this.panelSnapshot = {
      activityVisibility: this.state.activityVisibility,
    };
  }

  // La ventana pet (transparente/sin bordes/siempre-encima) es una WebviewWindow aparte creada en pet-window.ts; estas banderas ya solo describen la ventana main, que nunca es PET.
  private async applyWindowState(state: PresentationState): Promise<void> {
    await this.windowManager.setPresentationMode(state.mode);
    if (state.mode !== 'PET') {
      await this.windowManager.setTransparent(state.window.transparent);
      await this.windowManager.setBorderless(state.window.borderless);
      await this.windowManager.setResizable(state.window.resizable);
      await this.windowManager.setAlwaysOnTop(state.window.alwaysOnTop);
      await this.windowManager.setFocusable(state.window.focusable);
      await this.windowManager.setIgnoreMouseEvents(
        state.window.ignoreMouseEvents,
      );
    }
    await this.applyModeGeometry(state.mode);
  }

  private async applyModeGeometry(mode: PresentationMode): Promise<void> {
    if (mode === 'PET') return this.enterPetGeometry();
    return this.leavePetGeometry(mode);
  }

  private async enterPetGeometry(): Promise<void> {
    await this.windowManager.hide();
    await this.windowManager.showPetWindow(
      await this.resolvePetPosition(),
      this.petWindowSize,
      this.alwaysOnTopOverride ?? MODE_PROFILES.PET.window.alwaysOnTop,
    );
  }

  private async leavePetGeometry(mode: PresentationMode): Promise<void> {
    await this.windowManager.hidePetWindow();
    if (mode === 'FULL') await this.windowManager.setMaximized(true);
    await this.windowManager.show();
    await this.windowManager.focus();
  }

  private cornerPosition(): Extract<WindowPosition, { type: 'screen_corner' }> {
    return {
      type: 'screen_corner',
      corner: this.petWindowCorner,
      marginX: PET_WINDOW_MARGIN,
      marginY: PET_WINDOW_MARGIN,
    };
  }

  private async resolvePetPosition(): Promise<WindowPosition> {
    // D8: un punto arrastrado y persistido gana siempre sobre el calculo de esquina, hasta que se restaure explicitamente.
    if (this.petWindowPosition) {
      return { type: 'absolute', ...this.petWindowPosition };
    }
    const corner = this.cornerPosition();
    const monitors = await this.windowManager.getMonitors();
    const monitor = this.petMonitorId
      ? monitors.find((m) => m.id === this.petMonitorId)
      : ((await this.windowManager.getCurrentMonitor()) ?? undefined);
    if (!monitor) return corner;
    const { x, y } = calculateCornerPosition(
      monitor,
      corner,
      this.petWindowSize,
    );
    return { type: 'absolute', x, y };
  }

  // taxonomia-errores.md:39-48: registrar, sesion intacta (no le pertenece a esta capa), modo seguro, informar, nunca inalcanzable.
  private async recoverFromFailedTransition(
    fault: PresentationError,
  ): Promise<void> {
    this.registerFault(fault);
    await this.restoreSafeMode();
    this.notifyFault(fault);
  }

  // Ambos PresentationErrorKind son fallos de cambio de modo; el mensaje no distingue una capacidad de ventana concreta sin depender de texto fragil.
  private registerFault(fault: PresentationError): void {
    registerFailure('mode-change-error', fault.message);
  }

  private async restoreSafeMode(): Promise<void> {
    try {
      await this.applyWindowState(this.state);
    } catch {
      await this.applyLastResort();
    }
  }

  private async applyLastResort(): Promise<void> {
    Object.assign(this.state, { window: LAST_RESORT_WINDOW_FLAGS });
    await Promise.allSettled([
      this.windowManager.show(),
      this.windowManager.setFocusable(true),
      this.windowManager.setTransparent(false),
      this.windowManager.setBorderless(false),
      this.windowManager.setAlwaysOnTop(false),
      this.windowManager.setIgnoreMouseEvents(false),
    ]);
  }

  private notifyFault(fault: PresentationError): void {
    for (const handler of this.faultHandlers) handler(fault);
  }
}
