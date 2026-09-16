import {
  availableMonitors,
  currentMonitor,
  primaryMonitor,
  type Monitor,
} from '@tauri-apps/api/window';

export type { Monitor };

export interface MonitorBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MonitorInfo {
  id: string;
  bounds: MonitorBounds;
  workArea: MonitorBounds;
  scaleFactor: number;
  isPrimary: boolean;
}

export type ScreenCorner =
  'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface ScreenCornerPosition {
  corner: ScreenCorner;
  marginX: number;
  marginY: number;
}

export interface WindowDimensions {
  width: number;
  height: number;
}

function toBounds(
  position: { x: number; y: number },
  size: { width: number; height: number },
): MonitorBounds {
  return {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
  };
}

function isSameMonitor(a: Monitor, b: Monitor): boolean {
  return (
    a.position.x === b.position.x &&
    a.position.y === b.position.y &&
    a.size.width === b.size.width &&
    a.size.height === b.size.height
  );
}

export function toMonitorInfoList(
  monitors: Monitor[],
  primary: Monitor | null,
): MonitorInfo[] {
  return monitors.map((monitor) => ({
    id: monitor.name ?? `${monitor.position.x},${monitor.position.y}`,
    bounds: toBounds(monitor.position, monitor.size),
    workArea: toBounds(monitor.workArea.position, monitor.workArea.size),
    scaleFactor: monitor.scaleFactor,
    isPrimary: primary !== null && isSameMonitor(monitor, primary),
  }));
}

export function selectMonitor(
  monitors: MonitorInfo[],
  preferredId: string | null,
): MonitorInfo | null {
  if (monitors.length === 0) return null;
  const preferred =
    preferredId !== null
      ? monitors.find((monitor) => monitor.id === preferredId)
      : undefined;
  if (preferred) return preferred;
  return monitors.find((monitor) => monitor.isPrimary) ?? monitors[0];
}

export function calculateCornerPosition(
  monitor: MonitorInfo,
  position: ScreenCornerPosition,
  size: WindowDimensions,
): { x: number; y: number } {
  const { workArea } = monitor;
  const isLeft =
    position.corner === 'top-left' || position.corner === 'bottom-left';
  const isTop =
    position.corner === 'top-left' || position.corner === 'top-right';
  const x = isLeft
    ? workArea.x + position.marginX
    : workArea.x + workArea.width - position.marginX - size.width;
  const y = isTop
    ? workArea.y + position.marginY
    : workArea.y + workArea.height - position.marginY - size.height;
  return { x, y };
}

let simulatedMonitors: MonitorInfo[] | null = null;

// paso 1.6: configuracion de monitores simulada, aislada a esta capa, solo en dev (TC-091/TC-096). Persiste hasta desarmarse con null; no es de un solo uso como los arm*Fault.
export function armSimulatedMonitors(monitors: MonitorInfo[] | null): void {
  if (!import.meta.env.DEV) return;
  simulatedMonitors = monitors;
}

export async function getMonitors(): Promise<MonitorInfo[]> {
  if (simulatedMonitors !== null) return simulatedMonitors;
  const [monitors, primary] = await Promise.all([
    availableMonitors(),
    primaryMonitor(),
  ]);
  return toMonitorInfoList(monitors, primary);
}

export async function getCurrentMonitor(): Promise<MonitorInfo | null> {
  if (simulatedMonitors !== null) {
    return (
      simulatedMonitors.find((monitor) => monitor.isPrimary) ??
      simulatedMonitors[0] ??
      null
    );
  }
  const [current, primary] = await Promise.all([
    currentMonitor(),
    primaryMonitor(),
  ]);
  if (!current) return null;
  return toMonitorInfoList([current], primary)[0] ?? null;
}
