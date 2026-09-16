import { describe, expect, it } from 'vitest';
import {
  buildSessionStartOptions,
  draftFromSessionStartOptions,
  emptyStartOptionsDraft,
  validateStartOptionsDraft,
} from './session-start-options';

describe('buildSessionStartOptions', () => {
  it('un borrador vacio no produce ninguna opcion (identico a hoy)', () => {
    expect(buildSessionStartOptions(emptyStartOptionsDraft())).toEqual({});
  });

  it('cada campo por separado produce su opcion', () => {
    expect(
      buildSessionStartOptions({
        ...emptyStartOptionsDraft(),
        model: 'sonnet',
      }),
    ).toEqual({ model: 'sonnet' });

    expect(
      buildSessionStartOptions({
        ...emptyStartOptionsDraft(),
        permissionMode: 'plan',
      }),
    ).toEqual({ permissionMode: 'plan' });

    expect(
      buildSessionStartOptions({
        ...emptyStartOptionsDraft(),
        addDir: 'C:/a\nC:/b',
      }),
    ).toEqual({ addDir: ['C:/a', 'C:/b'] });

    expect(
      buildSessionStartOptions({
        ...emptyStartOptionsDraft(),
        allowedTools: 'Bash\nEdit',
      }),
    ).toEqual({ allowedTools: ['Bash', 'Edit'] });

    expect(
      buildSessionStartOptions({
        ...emptyStartOptionsDraft(),
        disallowedTools: 'Bash',
      }),
    ).toEqual({ disallowedTools: ['Bash'] });

    expect(
      buildSessionStartOptions({
        ...emptyStartOptionsDraft(),
        maxBudgetUsd: '5.5',
      }),
    ).toEqual({ maxBudgetUsd: 5.5 });
  });

  it('todos los campos juntos producen todas las opciones', () => {
    expect(
      buildSessionStartOptions({
        model: 'opus',
        permissionMode: 'auto',
        addDir: 'C:/extra',
        allowedTools: 'Bash',
        disallowedTools: 'Edit',
        maxBudgetUsd: '10',
      }),
    ).toEqual({
      model: 'opus',
      permissionMode: 'auto',
      addDir: ['C:/extra'],
      allowedTools: ['Bash'],
      disallowedTools: ['Edit'],
      maxBudgetUsd: 10,
    });
  });

  it('lineas en blanco y espacios se descartan al partir listas', () => {
    expect(
      buildSessionStartOptions({
        ...emptyStartOptionsDraft(),
        addDir: '  C:/a  \n\n  \nC:/b',
      }),
    ).toEqual({ addDir: ['C:/a', 'C:/b'] });
  });

  it('un limite de gasto invalido no se incluye en las opciones', () => {
    expect(
      buildSessionStartOptions({
        ...emptyStartOptionsDraft(),
        maxBudgetUsd: 'no es un numero',
      }),
    ).toEqual({});
    expect(
      buildSessionStartOptions({
        ...emptyStartOptionsDraft(),
        maxBudgetUsd: '-5',
      }),
    ).toEqual({});
  });
});

describe('validateStartOptionsDraft', () => {
  it('un borrador vacio no produce errores', () => {
    expect(validateStartOptionsDraft(emptyStartOptionsDraft())).toEqual([]);
  });

  it('un limite de gasto no numerico o no positivo se rechaza antes de invocar', () => {
    expect(
      validateStartOptionsDraft({
        ...emptyStartOptionsDraft(),
        maxBudgetUsd: 'abc',
      }),
    ).toHaveLength(1);
    expect(
      validateStartOptionsDraft({
        ...emptyStartOptionsDraft(),
        maxBudgetUsd: '0',
      }),
    ).toHaveLength(1);
  });

  it('un limite de gasto valido no produce errores', () => {
    expect(
      validateStartOptionsDraft({
        ...emptyStartOptionsDraft(),
        maxBudgetUsd: '12.5',
      }),
    ).toEqual([]);
  });
});

describe('draftFromSessionStartOptions', () => {
  it('opciones ausentes producen el borrador vacio', () => {
    expect(draftFromSessionStartOptions(undefined)).toEqual(
      emptyStartOptionsDraft(),
    );
  });

  it('reconstruye el borrador desde opciones reales (round-trip con buildSessionStartOptions)', () => {
    const options = {
      model: 'sonnet',
      permissionMode: 'plan' as const,
      addDir: ['C:/a', 'C:/b'],
      allowedTools: ['Bash'],
      disallowedTools: ['Edit'],
      maxBudgetUsd: 7.25,
    };

    const draft = draftFromSessionStartOptions(options);

    expect(buildSessionStartOptions(draft)).toEqual(options);
  });
});
