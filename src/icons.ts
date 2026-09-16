// Paths SVG inline minimos (D10/D13): sin libreria de iconos, el volumen real del plan es <20 iconos.
export const ICONS = {
  send: 'M2 21l21-9L2 3v7l15 2-15 2v7z',
  expand:
    'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3',
  collapse:
    'M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3m8-3v3a2 2 0 0 0 2 2h3',
  sendToDesktop: 'M4 4h16v11H4z M9 20h6 M12 15v5',
  play: 'M5 3l14 9-14 9V3z',
  edit: 'M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z',
  plus: 'M12 5v14M5 12h14',
  trash:
    'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z',
  check: 'M20 6 9 17l-5-5',
  copy: 'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  close: 'M18 6 6 18M6 6l12 12',
  folder:
    'M4 4h5l2 3h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  chevronLeft: 'M15 18l-6-6 6-6',
  warning:
    'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  error: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8v4M12 16h.01',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 16v-4M12 8h.01',
  // Marca oficial de Claude Code (path real del asset de marca) -- ya no la silueta generica de sunburst que ocupaba esta clave (evitaba el riesgo de marca antes de tener el asset real). --color-accent-primary ya es el naranja de marca exacto (#D97757 = rgb(217 119 87)), sin token nuevo.
  claude:
    'M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z',
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  // D6/H7: gauge/velocimetro generico -- un solo icono para el concepto de "esfuerzo", el nivel concreto lo dice el texto de la opcion elegida en el desplegable, no un icono distinto por nivel (EFFORT_LEVELS tiene 5 valores reales, no 3).
  gauge: 'M4 18a8 8 0 1 1 16 0M12 18l4-6',
} as const;

export type IconName = keyof typeof ICONS;

// Iconos cuyo trazo es la forma (figuras abiertas o con detalle interior) van a stroke; el resto son siluetas solidas a fill. Evita que cada consumidor tenga que saberlo.
const STROKE_ICONS = new Set<IconName>([
  'expand',
  'collapse',
  'sendToDesktop',
  'edit',
  'plus',
  'trash',
  'check',
  'copy',
  'close',
  'folder',
  'chevronLeft',
  'warning',
  'error',
  'info',
  'code',
  'gauge',
]);

export function isStrokeIcon(name: IconName): boolean {
  return STROKE_ICONS.has(name);
}
