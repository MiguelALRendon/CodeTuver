import {
  getCurrentWindow,
  PhysicalPosition,
  PhysicalSize,
  type Color,
} from '@tauri-apps/api/window';
import {
  getMonitors as queryMonitors,
  getCurrentMonitor as queryCurrentMonitor,
  calculateCornerPosition,
  type MonitorInfo,
} from './monitor-position';
import {
  showPetWindow as showPetWindowImpl,
  hidePetWindow as hidePetWindowImpl,
} from './pet-window';

export type { MonitorInfo };

export type PresentationMode = 'FULL' | 'COMPANION' | 'PET';

export type WindowPosition =
  | { type: 'absolute'; x: number; y: number }
  | {
      type: 'screen_corner';
      corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
      marginX: number;
      marginY: number;
    }
  | { type: 'monitor_relative'; monitorId: string; x: number; y: number };

export interface WindowSize {
  width: number;
  height: number;
}

export interface MouseEventOptions {
  forwardToUnderlyingWindow?: boolean;
  hitTestAvatarOnly?: boolean;
}

export interface DesktopWindowManager {
  setPresentationMode(mode: PresentationMode): Promise<void>;
  setAlwaysOnTop(enabled: boolean): Promise<void>;
  setTransparent(enabled: boolean): Promise<void>;
  setBorderless(enabled: boolean): Promise<void>;
  setResizable(enabled: boolean): Promise<void>;
  setMaximized(enabled: boolean): Promise<void>;
  setPosition(position: WindowPosition): Promise<void>;
  getPosition(): Promise<{ x: number; y: number }>;
  setSize(size: WindowSize): Promise<void>;
  startDragging(): Promise<void>;
  setIgnoreMouseEvents(
    enabled: boolean,
    options?: MouseEventOptions,
  ): Promise<void>;
  setFocusable(enabled: boolean): Promise<void>;
  showPetWindow(
    position: WindowPosition,
    size: WindowSize,
    alwaysOnTop: boolean,
  ): Promise<void>;
  hidePetWindow(): Promise<void>;
  show(): Promise<void>;
  hide(): Promise<void>;
  minimize(): Promise<void>;
  restore(): Promise<void>;
  focus(): Promise<void>;
  getMonitors(): Promise<MonitorInfo[]>;
  getCurrentMonitor(): Promise<MonitorInfo | null>;
}

export type WindowManagerErrorKind =
  | 'window-management-error'
  | 'unsupported-capability'
  | 'mode-change-error'
  | 'window-restore-error'
  | 'monitor-query-error';

export interface WindowManagerError {
  kind: WindowManagerErrorKind;
  message: string;
}

function windowError(message: string): WindowManagerError {
  return { kind: 'window-management-error', message };
}

function capabilityError(message: string): WindowManagerError {
  return { kind: 'unsupported-capability', message };
}

function modeChangeError(message: string): WindowManagerError {
  return { kind: 'mode-change-error', message };
}

function restoreError(message: string): WindowManagerError {
  return { kind: 'window-restore-error', message };
}

function monitorQueryError(message: string): WindowManagerError {
  return { kind: 'monitor-query-error', message };
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isWindowManagerError(error: unknown): error is WindowManagerError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    'message' in error
  );
}

// Tauri no permite alternar la propiedad de creacion transparent en runtime (ADR-0008); se simula pintando el color de fondo.
const OPAQUE_FALLBACK_COLOR: Color = [255, 255, 255, 255];
const TRANSPARENT_FALLBACK_COLOR: Color = [0, 0, 0, 0];

export type WindowCapability =
  | 'setPresentationMode'
  | 'setAlwaysOnTop'
  | 'setTransparent'
  | 'setBorderless'
  | 'setResizable'
  | 'setMaximized'
  | 'setPosition'
  | 'getPosition'
  | 'setSize'
  | 'startDragging'
  | 'setIgnoreMouseEvents'
  | 'setFocusable'
  | 'showPetWindow'
  | 'hidePetWindow'
  | 'show'
  | 'hide'
  | 'minimize'
  | 'restore'
  | 'focus'
  | 'getMonitors'
  | 'getCurrentMonitor';

let armedCapability: WindowCapability | null = null;

// paso 1.5: ausencia simulada de capacidad de ventana, aislada a esta capa, solo en dev (TC-079).
export function armMissingWindowCapability(
  capability: WindowCapability | null,
): void {
  if (!import.meta.env.DEV) return;
  armedCapability = capability;
}

function consumeCapabilityFault(capability: WindowCapability): boolean {
  if (armedCapability !== capability) return false;
  armedCapability = null;
  return true;
}

type TauriWindow = ReturnType<typeof getCurrentWindow>;

export class TauriDesktopWindowManager implements DesktopWindowManager {
  private cachedWindow: TauriWindow | undefined;

  constructor(private readonly windowOverride?: TauriWindow) {}

  // getCurrentWindow() lanza sin runtime Tauri (ej. npm run dev en navegador puro); resolverla perezosa, dentro de guarded(), la deja caer por el mismo camino de degradacion que el resto de fallos de esta clase, en vez de tumbar la construccion del objeto.
  private window(): TauriWindow {
    if (this.windowOverride) return this.windowOverride;
    if (!this.cachedWindow) this.cachedWindow = getCurrentWindow();
    return this.cachedWindow;
  }

  private async guarded<T>(
    capability: WindowCapability,
    onFault: () => WindowManagerError,
    operation: () => Promise<T>,
    onError: (message: string) => WindowManagerError,
  ): Promise<T> {
    if (consumeCapabilityFault(capability)) throw onFault();
    try {
      return await operation();
    } catch (error) {
      if (isWindowManagerError(error)) throw error;
      throw onError(toMessage(error));
    }
  }

  // Hito 1 solo expone el metodo del contrato; la maquina de estados de transiciones llega en el Hito 2 (paso 2.3).
  setPresentationMode(_mode: PresentationMode): Promise<void> {
    return this.guarded(
      'setPresentationMode',
      () =>
        modeChangeError('capacidad de cambio de modo simulada como ausente'),
      async () => undefined,
      modeChangeError,
    );
  }

  setAlwaysOnTop(enabled: boolean): Promise<void> {
    return this.guarded(
      'setAlwaysOnTop',
      () => capabilityError('siempre-encima simulado como no soportado'),
      () => this.window().setAlwaysOnTop(enabled),
      windowError,
    );
  }

  setTransparent(enabled: boolean): Promise<void> {
    return this.guarded(
      'setTransparent',
      () => capabilityError('simulacion de transparencia no disponible'),
      () =>
        this.window().setBackgroundColor(
          enabled ? TRANSPARENT_FALLBACK_COLOR : OPAQUE_FALLBACK_COLOR,
        ),
      windowError,
    );
  }

  setBorderless(enabled: boolean): Promise<void> {
    return this.guarded(
      'setBorderless',
      () => capabilityError('modo sin bordes simulado como no soportado'),
      () => this.window().setDecorations(!enabled),
      windowError,
    );
  }

  setResizable(enabled: boolean): Promise<void> {
    return this.guarded(
      'setResizable',
      () => capabilityError('redimensionable simulado como no soportado'),
      () => this.window().setResizable(enabled),
      windowError,
    );
  }

  setMaximized(enabled: boolean): Promise<void> {
    return this.guarded(
      'setMaximized',
      () => windowError('maximizar simulado como ausente'),
      () => (enabled ? this.window().maximize() : this.window().unmaximize()),
      windowError,
    );
  }

  setPosition(position: WindowPosition): Promise<void> {
    return this.guarded(
      'setPosition',
      () => windowError('posicionamiento simulado como ausente'),
      async () => {
        const { x, y } = await this.resolvePosition(position);
        await this.window().setPosition(new PhysicalPosition(x, y));
      },
      windowError,
    );
  }

  getPosition(): Promise<{ x: number; y: number }> {
    return this.guarded(
      'getPosition',
      () => windowError('posicion actual simulada como ausente'),
      async () => {
        const { x, y } = await this.window().outerPosition();
        return { x, y };
      },
      windowError,
    );
  }

  setSize(size: WindowSize): Promise<void> {
    return this.guarded(
      'setSize',
      () => windowError('cambio de tamaño simulado como ausente'),
      () => this.window().setSize(new PhysicalSize(size.width, size.height)),
      windowError,
    );
  }

  startDragging(): Promise<void> {
    return this.guarded(
      'startDragging',
      () => windowError('arrastre simulado como ausente'),
      () => this.window().startDragging(),
      windowError,
    );
  }

  setIgnoreMouseEvents(
    enabled: boolean,
    options?: MouseEventOptions,
  ): Promise<void> {
    return this.guarded(
      'setIgnoreMouseEvents',
      () => capabilityError('clic que atraviesa simulado como no soportado'),
      () => this.applyIgnoreMouseEvents(enabled, options),
      windowError,
    );
  }

  setFocusable(enabled: boolean): Promise<void> {
    return this.guarded(
      'setFocusable',
      () => capabilityError('foco configurable simulado como no soportado'),
      () => this.window().setFocusable(enabled),
      windowError,
    );
  }

  showPetWindow(
    position: WindowPosition,
    size: WindowSize,
    alwaysOnTop: boolean,
  ): Promise<void> {
    return this.guarded(
      'showPetWindow',
      () => windowError('mostrar ventana mascota simulado como ausente'),
      async () =>
        showPetWindowImpl(
          await this.resolvePosition(position),
          size,
          alwaysOnTop,
        ),
      windowError,
    );
  }

  hidePetWindow(): Promise<void> {
    return this.guarded(
      'hidePetWindow',
      () => windowError('ocultar ventana mascota simulado como ausente'),
      () => hidePetWindowImpl(),
      windowError,
    );
  }

  show(): Promise<void> {
    return this.guarded(
      'show',
      () => windowError('mostrar ventana simulado como ausente'),
      () => this.window().show(),
      windowError,
    );
  }

  hide(): Promise<void> {
    return this.guarded(
      'hide',
      () => windowError('ocultar ventana simulado como ausente'),
      () => this.window().hide(),
      windowError,
    );
  }

  minimize(): Promise<void> {
    return this.guarded(
      'minimize',
      () => windowError('minimizar simulado como ausente'),
      () => this.window().minimize(),
      windowError,
    );
  }

  restore(): Promise<void> {
    return this.guarded(
      'restore',
      () => restoreError('restaurar ventana simulado como ausente'),
      async () => {
        await this.window().unminimize();
        await this.window().show();
      },
      restoreError,
    );
  }

  focus(): Promise<void> {
    return this.guarded(
      'focus',
      () => windowError('foco simulado como ausente'),
      () => this.window().setFocus(),
      windowError,
    );
  }

  getMonitors(): Promise<MonitorInfo[]> {
    return this.guarded(
      'getMonitors',
      () => monitorQueryError('enumeracion de monitores simulada como ausente'),
      () => queryMonitors(),
      monitorQueryError,
    );
  }

  getCurrentMonitor(): Promise<MonitorInfo | null> {
    return this.guarded(
      'getCurrentMonitor',
      () => monitorQueryError('monitor actual simulado como ausente'),
      () => queryCurrentMonitor(),
      monitorQueryError,
    );
  }

  private async applyIgnoreMouseEvents(
    enabled: boolean,
    options?: MouseEventOptions,
  ): Promise<void> {
    if (options?.hitTestAvatarOnly) {
      throw new Error(
        'clic solo sobre el avatar no soportado por Tauri; fallback documentado: la ventana captura todo el clic',
      );
    }
    await this.window().setIgnoreCursorEvents(enabled);
  }

  private async resolvePosition(
    position: WindowPosition,
  ): Promise<{ x: number; y: number }> {
    if (position.type === 'absolute') return position;
    if (position.type === 'monitor_relative') {
      return this.resolveMonitorRelative(position);
    }
    return this.resolveScreenCorner(position);
  }

  private async resolveMonitorRelative(position: {
    monitorId: string;
    x: number;
    y: number;
  }): Promise<{ x: number; y: number }> {
    const monitors = await queryMonitors();
    const monitor = monitors.find((m) => m.id === position.monitorId);
    if (!monitor) throw monitorRelativeNotFound(position.monitorId);
    return {
      x: monitor.bounds.x + position.x,
      y: monitor.bounds.y + position.y,
    };
  }

  private async resolveScreenCorner(position: {
    corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    marginX: number;
    marginY: number;
  }): Promise<{ x: number; y: number }> {
    const [monitor, outerSize] = await Promise.all([
      queryCurrentMonitor(),
      this.window().outerSize(),
    ]);
    if (!monitor) throw monitorQueryError('no hay monitor actual disponible');
    return calculateCornerPosition(monitor, position, outerSize);
  }
}

function monitorRelativeNotFound(monitorId: string): WindowManagerError {
  return monitorQueryError(`el monitor persistido "${monitorId}" ya no existe`);
}

export async function getCurrentWindowLabel(): Promise<string> {
  return getCurrentWindow().label;
}
