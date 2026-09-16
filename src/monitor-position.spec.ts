import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import {
  armSimulatedMonitors,
  calculateCornerPosition,
  getCurrentMonitor,
  getMonitors,
  selectMonitor,
  toMonitorInfoList,
  type MonitorInfo,
  type Monitor,
} from './monitor-position';

const { availableMonitors, currentMonitor, primaryMonitor } = vi.hoisted(
  () => ({
    availableMonitors: vi.fn(),
    currentMonitor: vi.fn(),
    primaryMonitor: vi.fn(),
  }),
);
vi.mock('@tauri-apps/api/window', () => ({
  availableMonitors,
  currentMonitor,
  primaryMonitor,
}));

afterEach(() => {
  armSimulatedMonitors(null);
});

function makeMonitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    name: null,
    size: new PhysicalSize(1920, 1080),
    position: new PhysicalPosition(0, 0),
    workArea: {
      position: new PhysicalPosition(0, 0),
      size: new PhysicalSize(1920, 1040),
    },
    scaleFactor: 1,
    ...overrides,
  };
}

function makeMonitorInfo(overrides: Partial<MonitorInfo> = {}): MonitorInfo {
  return {
    id: 'monitor-1',
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    scaleFactor: 1,
    isPrimary: true,
    ...overrides,
  };
}

describe('toMonitorInfoList', () => {
  it('preserva coordenadas negativas de un monitor a la izquierda del primario', () => {
    const primary = makeMonitor({ name: 'DISPLAY1' });
    const secondary = makeMonitor({
      name: 'DISPLAY2',
      position: new PhysicalPosition(-1920, 0),
      workArea: {
        position: new PhysicalPosition(-1920, 0),
        size: new PhysicalSize(1920, 1040),
      },
    });

    const [, info] = toMonitorInfoList([primary, secondary], primary);

    expect(info.bounds.x).toBe(-1920);
    expect(info.workArea.x).toBe(-1920);
    expect(info.isPrimary).toBe(false);
  });

  it('conserva dos densidades distintas en la misma enumeracion', () => {
    const hidpi = makeMonitor({ name: 'DISPLAY1', scaleFactor: 2 });
    const lodpi = makeMonitor({
      name: 'DISPLAY2',
      position: new PhysicalPosition(1920, 0),
      scaleFactor: 1,
    });

    const [first, second] = toMonitorInfoList([hidpi, lodpi], hidpi);

    expect(first.scaleFactor).toBe(2);
    expect(second.scaleFactor).toBe(1);
  });

  it('devuelve lista vacia sin explotar cuando no hay monitores', () => {
    expect(toMonitorInfoList([], null)).toEqual([]);
  });
});

describe('selectMonitor', () => {
  it('recae en el monitor primario cuando el id guardado ya no existe', () => {
    const monitors = [
      makeMonitorInfo({ id: 'a', isPrimary: false }),
      makeMonitorInfo({ id: 'b', isPrimary: true }),
    ];

    const selected = selectMonitor(monitors, 'monitor-fantasma');

    expect(selected?.id).toBe('b');
  });

  it('devuelve null sin explotar cuando la lista de monitores esta vacia', () => {
    expect(selectMonitor([], 'cualquiera')).toBeNull();
  });
});

describe('calculateCornerPosition', () => {
  const size = { width: 200, height: 100 };

  it('respeta la barra de tareas arriba (workArea.y desplazado)', () => {
    const monitor = makeMonitorInfo({
      workArea: { x: 0, y: 40, width: 1920, height: 1040 },
    });

    const { y } = calculateCornerPosition(
      monitor,
      { corner: 'top-left', marginX: 0, marginY: 0 },
      size,
    );

    expect(y).toBe(40);
  });

  it('respeta la barra de tareas abajo (workArea.height reducido)', () => {
    const monitor = makeMonitorInfo({
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    });

    const { y } = calculateCornerPosition(
      monitor,
      { corner: 'bottom-left', marginX: 0, marginY: 0 },
      size,
    );

    expect(y).toBe(1040 - size.height);
  });

  it('respeta la barra de tareas a la izquierda (workArea.x desplazado)', () => {
    const monitor = makeMonitorInfo({
      workArea: { x: 48, y: 0, width: 1872, height: 1080 },
    });

    const { x } = calculateCornerPosition(
      monitor,
      { corner: 'top-left', marginX: 0, marginY: 0 },
      size,
    );

    expect(x).toBe(48);
  });

  it('respeta la barra de tareas a la derecha (workArea.width reducido)', () => {
    const monitor = makeMonitorInfo({
      workArea: { x: 0, y: 0, width: 1872, height: 1080 },
    });

    const { x } = calculateCornerPosition(
      monitor,
      { corner: 'top-right', marginX: 0, marginY: 0 },
      size,
    );

    expect(x).toBe(1872 - size.width);
  });

  it('calcula las cuatro esquinas con margen sobre un monitor simple (happy path)', () => {
    const monitor = makeMonitorInfo();
    const margin = { corner: 'top-left' as const, marginX: 10, marginY: 20 };

    expect(calculateCornerPosition(monitor, margin, size)).toEqual({
      x: 10,
      y: 20,
    });
    expect(
      calculateCornerPosition(
        monitor,
        { ...margin, corner: 'top-right' },
        size,
      ),
    ).toEqual({
      x: 1920 - 10 - size.width,
      y: 20,
    });
    expect(
      calculateCornerPosition(
        monitor,
        { ...margin, corner: 'bottom-left' },
        size,
      ),
    ).toEqual({
      x: 10,
      y: 1040 - 20 - size.height,
    });
    expect(
      calculateCornerPosition(
        monitor,
        { ...margin, corner: 'bottom-right' },
        size,
      ),
    ).toEqual({
      x: 1920 - 10 - size.width,
      y: 1040 - 20 - size.height,
    });
  });

  it('no valida ni recorta cuando el margen y tamaño exceden el área de trabajo (documenta el limite conocido)', () => {
    const monitor = makeMonitorInfo();
    const oversizedMargin = {
      corner: 'top-left' as const,
      marginX: 3000,
      marginY: 3000,
    };

    expect(calculateCornerPosition(monitor, oversizedMargin, size)).toEqual({
      x: 3000,
      y: 3000,
    });
  });
});

describe('getCurrentMonitor', () => {
  it('devuelve null cuando Tauri no reporta un monitor actual', async () => {
    currentMonitor.mockResolvedValueOnce(null);
    primaryMonitor.mockResolvedValueOnce(makeMonitor());

    expect(await getCurrentMonitor()).toBeNull();
  });

  it('traduce el monitor actual real de Tauri al contrato MonitorInfo (happy path)', async () => {
    const monitor = makeMonitor({ name: 'DISPLAY1' });
    currentMonitor.mockResolvedValueOnce(monitor);
    primaryMonitor.mockResolvedValueOnce(monitor);

    const info = await getCurrentMonitor();

    expect(info?.id).toBe('DISPLAY1');
    expect(info?.isPrimary).toBe(true);
  });
});

describe('getMonitors', () => {
  it('traduce la enumeracion real de Tauri al contrato MonitorInfo[] (happy path)', async () => {
    const primary = makeMonitor({ name: 'DISPLAY1' });
    const secondary = makeMonitor({
      name: 'DISPLAY2',
      position: new PhysicalPosition(1920, 0),
    });
    availableMonitors.mockResolvedValueOnce([primary, secondary]);
    primaryMonitor.mockResolvedValueOnce(primary);

    const monitors = await getMonitors();

    expect(monitors).toHaveLength(2);
    expect(monitors[0].isPrimary).toBe(true);
    expect(monitors[1].isPrimary).toBe(false);
  });
});

describe('armSimulatedMonitors', () => {
  beforeEach(() => {
    availableMonitors.mockClear();
    primaryMonitor.mockClear();
  });

  it('getMonitors devuelve la lista simulada sin llamar a la API real de Tauri', async () => {
    armSimulatedMonitors([makeMonitorInfo({ id: 'simulado' })]);

    const monitors = await getMonitors();

    expect(monitors).toEqual([makeMonitorInfo({ id: 'simulado' })]);
    expect(availableMonitors).not.toHaveBeenCalled();
    expect(primaryMonitor).not.toHaveBeenCalled();
  });

  it('getCurrentMonitor devuelve el monitor marcado isPrimary de la lista simulada', async () => {
    armSimulatedMonitors([
      makeMonitorInfo({ id: 'secundario', isPrimary: false }),
      makeMonitorInfo({ id: 'principal', isPrimary: true }),
    ]);

    const current = await getCurrentMonitor();

    expect(current?.id).toBe('principal');
  });

  it('getCurrentMonitor recae en el primero de la lista cuando ningun monitor simulado es primario', async () => {
    armSimulatedMonitors([
      makeMonitorInfo({ id: 'uno', isPrimary: false }),
      makeMonitorInfo({ id: 'dos', isPrimary: false }),
    ]);

    const current = await getCurrentMonitor();

    expect(current?.id).toBe('uno');
  });

  it('armSimulatedMonitors(null) desarma la simulacion y getMonitors vuelve a consultar la API real', async () => {
    armSimulatedMonitors([makeMonitorInfo({ id: 'simulado' })]);
    armSimulatedMonitors(null);
    const real = makeMonitor({ name: 'DISPLAY-REAL' });
    availableMonitors.mockResolvedValueOnce([real]);
    primaryMonitor.mockResolvedValueOnce(real);

    const monitors = await getMonitors();

    expect(availableMonitors).toHaveBeenCalledTimes(1);
    expect(monitors[0].id).toBe('DISPLAY-REAL');
  });

  it('la simulacion persiste entre llamadas sucesivas sin volver a armarla', async () => {
    armSimulatedMonitors([makeMonitorInfo({ id: 'persistente' })]);

    const first = await getMonitors();
    const second = await getMonitors();

    expect(first[0].id).toBe('persistente');
    expect(second[0].id).toBe('persistente');
    expect(availableMonitors).not.toHaveBeenCalled();
  });

  it('devuelve exactamente 2 monitores simulados (principal + secundario desplazado) con sus datos intactos (happy path)', async () => {
    const principal = makeMonitorInfo({ id: 'principal', isPrimary: true });
    const secundario = makeMonitorInfo({
      id: 'secundario',
      isPrimary: false,
      bounds: { x: 1920, y: 0, width: 1280, height: 720 },
      workArea: { x: 1920, y: 0, width: 1280, height: 680 },
    });
    armSimulatedMonitors([principal, secundario]);

    const monitors = await getMonitors();

    expect(monitors).toEqual([principal, secundario]);
  });
});
