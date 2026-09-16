import { describe, expect, it } from 'vitest';
import type { SessionSummary } from './session-history';
import {
  cwdToProjectFolder,
  describeProjectFolder,
  formatSessionCost,
  formatSessionDate,
  formatSessionDuration,
  formatSessionTokens,
  pickRecentSessionsAcrossFolders,
  sortSessionsByDateDescending,
  totalSessionTokens,
  truncateProjectFolderSegments,
  truncateSessionTitle,
} from './session-history-format';

describe('formatSessionDuration', () => {
  it('null cae a "duracion desconocida"', () => {
    expect(formatSessionDuration(null)).toBe('duracion desconocida');
  });

  it('formatea horas y minutos', () => {
    expect(formatSessionDuration(28005980)).toBe('7h 46m');
  });

  it('formatea solo minutos por debajo de una hora', () => {
    expect(formatSessionDuration(125000)).toBe('2m');
  });

  it('formatea segundos por debajo de un minuto', () => {
    expect(formatSessionDuration(4500)).toBe('5s');
  });
});

describe('formatSessionCost', () => {
  it('null cae a "costo desconocido"', () => {
    expect(formatSessionCost(null)).toBe('costo desconocido');
  });

  it('formatea a 2 decimales con signo de dolar', () => {
    expect(formatSessionCost(70.02732895)).toBe('$70.03');
  });

  it('costo cero se formatea, no se confunde con desconocido', () => {
    expect(formatSessionCost(0)).toBe('$0.00');
  });
});

describe('totalSessionTokens / formatSessionTokens', () => {
  it('modelUsage nulo cae a "tokens desconocidos"', () => {
    expect(totalSessionTokens(null)).toBeNull();
    expect(formatSessionTokens(null)).toBe('tokens desconocidos');
  });

  it('suma input+output de todos los modelos', () => {
    const usage = {
      'claude-haiku-4-5-20251001': {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadInputTokens: null,
        cacheCreationInputTokens: null,
        costUsd: null,
      },
      'claude-sonnet-5': {
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadInputTokens: null,
        cacheCreationInputTokens: null,
        costUsd: null,
      },
    };
    expect(totalSessionTokens(usage)).toBe(1650);
    expect(formatSessionTokens(usage)).toBe('1.6K tokens');
  });

  it('formatea en millones cuando el total lo amerita', () => {
    const usage = {
      m: {
        inputTokens: 2_000_000,
        outputTokens: 500_000,
        cacheReadInputTokens: null,
        cacheCreationInputTokens: null,
        costUsd: null,
      },
    };
    expect(formatSessionTokens(usage)).toBe('2.5M tokens');
  });
});

describe('formatSessionDate', () => {
  it('null cae a "fecha desconocida"', () => {
    expect(formatSessionDate(null)).toBe('fecha desconocida');
  });

  it('formatea DD/MM/YYYY de forma determinista', () => {
    const ms = new Date(2026, 8, 6, 12, 0, 0).getTime();
    expect(formatSessionDate(ms)).toBe('06/09/2026');
  });
});

describe('truncateSessionTitle', () => {
  it('null cae a "Sesion sin titulo"', () => {
    expect(truncateSessionTitle(null)).toBe('Sesion sin titulo');
  });

  it('cadena vacia o solo espacios cae a "Sesion sin titulo"', () => {
    expect(truncateSessionTitle('   ')).toBe('Sesion sin titulo');
  });

  it('colapsa saltos de linea a un solo espacio', () => {
    expect(truncateSessionTitle('linea uno\n\nlinea dos')).toBe(
      'linea uno linea dos',
    );
  });

  it('un titulo corto queda intacto', () => {
    expect(truncateSessionTitle('hola')).toBe('hola');
  });

  it('un titulo largo se trunca con elipsis', () => {
    const long = 'a'.repeat(100);
    const truncated = truncateSessionTitle(long);
    expect(truncated.length).toBe(80);
    expect(truncated.endsWith('…')).toBe(true);
  });

  it('un titulo que es en realidad un comando de terminal crudo muestra /nombre en vez del XML (H3/D4)', () => {
    const raw =
      '<command-name>/clear</command-name>\n<command-message>clear</command-message>\n<command-args></command-args>';
    expect(truncateSessionTitle(raw)).toBe('/clear');
  });

  it('un titulo de prosa real que menciona "<command-name>" sin las otras 2 etiquetas no se confunde con un comando', () => {
    expect(truncateSessionTitle('duda sobre <command-name> en el codigo')).toBe(
      'duda sobre <command-name> en el codigo',
    );
  });
});

function session(id: string, startTimeMs: number | null): SessionSummary {
  return {
    id,
    title: null,
    cwd: null,
    gitBranch: null,
    cliVersion: null,
    totalCostUsd: null,
    totalDurationMs: null,
    startTimeMs,
    modelUsage: null,
  };
}

describe('sortSessionsByDateDescending', () => {
  it('ordena de mas reciente a mas antigua', () => {
    const sessions = [
      session('vieja', 100),
      session('nueva', 300),
      session('media', 200),
    ];

    const sorted = sortSessionsByDateDescending(sessions);

    expect(sorted.map((s) => s.id)).toEqual(['nueva', 'media', 'vieja']);
  });

  it('sesiones sin fecha quedan al final, no rompen el orden', () => {
    const sessions = [
      session('sin-fecha', null),
      session('reciente', 500),
      session('antigua', 100),
    ];

    const sorted = sortSessionsByDateDescending(sessions);

    expect(sorted.map((s) => s.id)).toEqual([
      'reciente',
      'antigua',
      'sin-fecha',
    ]);
  });

  it('no muta el arreglo original', () => {
    const sessions = [session('a', 1), session('b', 2)];
    const original = [...sessions];

    sortSessionsByDateDescending(sessions);

    expect(sessions).toEqual(original);
  });
});

describe('pickRecentSessionsAcrossFolders', () => {
  it('junta sesiones de varias carpetas y ordena por fecha descendente', () => {
    const result = pickRecentSessionsAcrossFolders(
      [
        { folder: 'proyecto-a', sessions: [session('a-vieja', 100)] },
        { folder: 'proyecto-b', sessions: [session('b-nueva', 300)] },
      ],
      5,
    );

    expect(result.map((s) => `${s.folder}:${s.id}`)).toEqual([
      'proyecto-b:b-nueva',
      'proyecto-a:a-vieja',
    ]);
  });

  it('recorta al limite dado', () => {
    const result = pickRecentSessionsAcrossFolders(
      [
        {
          folder: 'proyecto-a',
          sessions: [session('1', 100), session('2', 200), session('3', 300)],
        },
      ],
      2,
    );

    expect(result.map((s) => s.id)).toEqual(['3', '2']);
  });

  it('sin carpetas ni sesiones devuelve arreglo vacio', () => {
    expect(pickRecentSessionsAcrossFolders([], 5)).toEqual([]);
  });
});

describe('cwdToProjectFolder', () => {
  it('reemplaza dos puntos y backslash preservando mayusculas/minusculas', () => {
    expect(
      cwdToProjectFolder('C:\\Users\\spook\\OneDrive\\Documents\\VtuberXD'),
    ).toBe('C--Users-spook-OneDrive-Documents-VtuberXD');
  });

  it('reemplaza barra y espacio', () => {
    expect(cwdToProjectFolder('/home/user/mi proyecto')).toBe(
      '-home-user-mi-proyecto',
    );
  });

  it('preserva minuscula de unidad tal cual', () => {
    expect(cwdToProjectFolder('c:\\Users\\spook\\Proyecto')).toBe(
      'c--Users-spook-Proyecto',
    );
  });
});

describe('describeProjectFolder (D5)', () => {
  it('revierte un caso real conocido de esta maquina', () => {
    expect(
      describeProjectFolder('C--Users-spook-OneDrive-Documents-VtuberXD'),
    ).toBe('C:\\Users\\spook\\OneDrive\\Documents\\VtuberXD');
  });

  it('devuelve el valor crudo sin cambios si no matchea el patron de unidad esperado', () => {
    expect(describeProjectFolder('-home-user-mi-proyecto')).toBe(
      '-home-user-mi-proyecto',
    );
  });
});

describe('truncateProjectFolderSegments', () => {
  it('deja intacta una ruta con pocos segmentos', () => {
    expect(truncateProjectFolderSegments('C:\\Users\\spook')).toBe(
      'C:\\Users\\spook',
    );
  });

  it('trunca segmentos intermedios de una ruta larga mostrando primeros/ultimos con "..." en medio', () => {
    expect(
      truncateProjectFolderSegments(
        'C:\\Users\\spook\\OneDrive\\Documents\\VtuberXD',
      ),
    ).toBe('C:\\Users\\...\\Documents\\VtuberXD');
  });
});
