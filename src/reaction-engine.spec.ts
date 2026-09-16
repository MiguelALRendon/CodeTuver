import { describe, expect, it } from 'vitest';
import type { NormalizedEvent } from './claude-transport';
import type { AvatarController } from './avatar-controller';
import type { TextToSpeech } from './text-to-speech';
import {
  REACTION_CATALOG,
  type AvatarReactionDefinition,
} from './reaction-catalog';
import { ReactionEngine, resolveReaction } from './reaction-engine';

function fileRead(path: string): NormalizedEvent {
  return { type: 'file_read', path };
}

function toolStarted(name: string, id = 't1'): NormalizedEvent {
  return { type: 'tool_started', name, id };
}

function toolFinished(success: boolean, toolUseId = 't1'): NormalizedEvent {
  return { type: 'tool_finished', success, tool_use_id: toolUseId };
}

function commandStarted(command: string, id = 'c1'): NormalizedEvent {
  return { type: 'command_started', command, id };
}

function thinking(): NormalizedEvent {
  return { type: 'thinking' };
}

function permissionDenied(toolName: string): NormalizedEvent {
  return { type: 'permission_denied', tool_name: toolName };
}

function createAvatarSpy(): { controller: AvatarController; calls: string[] } {
  const calls: string[] = [];
  const controller: AvatarController = {
    setState: (state) => calls.push(`setState:${state}`),
    setExpression: (expression) => calls.push(`setExpression:${expression}`),
    speak: async () => {},
    stopSpeaking: () => {},
  };
  return { controller, calls };
}

function buildInterruptionCatalog(): AvatarReactionDefinition[] {
  return [
    {
      id: 'low',
      triggers: ['file_read'],
      priority: 10,
      durationMs: 1000,
      state: 'low-priority-state',
      speechPolicy: 'never',
      interruptible: true,
    },
    {
      id: 'high',
      triggers: ['tool_started'],
      priority: 50,
      durationMs: 500,
      state: 'high-priority-state',
      speechPolicy: 'never',
      interruptible: true,
    },
  ];
}

function buildNonInterruptibleCatalog(): AvatarReactionDefinition[] {
  return [
    {
      id: 'blocker',
      triggers: ['command_started'],
      priority: 20,
      durationMs: 1000,
      state: 'blocked-state',
      speechPolicy: 'never',
      interruptible: false,
    },
    {
      id: 'higher',
      triggers: ['tool_started'],
      priority: 90,
      state: 'higher-state',
      speechPolicy: 'never',
      interruptible: true,
    },
  ];
}

function buildCooldownCatalog(): AvatarReactionDefinition[] {
  return [
    {
      id: 'cooled',
      triggers: ['file_read'],
      priority: 10,
      durationMs: 100,
      cooldownMs: 5000,
      state: 'cooled-state',
      speechPolicy: 'never',
      interruptible: true,
    },
  ];
}

function buildTieCatalog(): AvatarReactionDefinition[] {
  return [
    {
      id: 'first',
      triggers: ['file_read'],
      priority: 10,
      state: 'first-state',
      speechPolicy: 'never',
      interruptible: true,
    },
    {
      id: 'second',
      triggers: ['file_read'],
      priority: 10,
      state: 'second-state',
      speechPolicy: 'never',
      interruptible: true,
    },
  ];
}

describe('ReactionEngine — casos adversos', () => {
  it('quince file_read consecutivos con el mismo instante producen una sola activacion (AUT-07)', () => {
    const { controller, calls } = createAvatarSpy();
    const engine = new ReactionEngine(REACTION_CATALOG, controller, {
      now: () => 1000,
    });

    for (let i = 0; i < 15; i += 1) {
      engine.handleEvent(fileRead(`archivo-${i}.ts`));
    }

    expect(calls).toEqual(['setState:reading', 'setExpression:neutral']);
  });

  it('una reaccion de mayor prioridad interrumpe a una interruptible activa y esta no se relanza al expirar la ganadora (AUT-08)', () => {
    let currentTime = 0;
    const { controller, calls } = createAvatarSpy();
    const engine = new ReactionEngine(buildInterruptionCatalog(), controller, {
      now: () => currentTime,
    });

    engine.handleEvent(fileRead('a.ts'));
    currentTime = 100;
    engine.handleEvent(toolStarted('Grep'));
    currentTime = 700;
    engine.handleEvent(thinking());

    expect(
      calls.filter((call) => call === 'setState:low-priority-state'),
    ).toHaveLength(1);
  });

  it('una reaccion activa con interruptible:false bloquea incluso a una de mayor prioridad', () => {
    let currentTime = 0;
    const { controller, calls } = createAvatarSpy();
    const engine = new ReactionEngine(
      buildNonInterruptibleCatalog(),
      controller,
      {
        now: () => currentTime,
      },
    );

    engine.handleEvent(commandStarted('npm test'));
    currentTime = 100;
    engine.handleEvent(toolStarted('Bash'));

    expect(calls).not.toContain('setState:higher-state');
  });

  it('el cooldown permite disparar de nuevo justo en el instante exacto en que expira (limite no suprimido)', () => {
    let currentTime = 0;
    const { controller, calls } = createAvatarSpy();
    const engine = new ReactionEngine(buildCooldownCatalog(), controller, {
      now: () => currentTime,
    });

    engine.handleEvent(fileRead('a.ts'));
    currentTime = 5000;
    engine.handleEvent(fileRead('b.ts'));

    expect(
      calls.filter((call) => call === 'setState:cooled-state'),
    ).toHaveLength(2);
  });

  it('dos reacciones con la misma prioridad para el mismo trigger resuelven siempre a la misma ganadora deterministica', () => {
    const catalog = buildTieCatalog();
    const event = fileRead('a.ts');

    const winners = [
      resolveReaction(catalog, event)?.id,
      resolveReaction(catalog, event)?.id,
      resolveReaction(catalog, event)?.id,
    ];

    expect(winners).toEqual(['first', 'first', 'first']);
  });

  it('un evento sin ninguna reaccion en el catalogo no llama al avatar ni lanza excepcion', () => {
    const { controller, calls } = createAvatarSpy();
    const reducedCatalog: AvatarReactionDefinition[] = [
      {
        id: 'solo-file-read',
        triggers: ['file_read'],
        priority: 10,
        state: 'x',
        speechPolicy: 'never',
        interruptible: true,
      },
    ];
    const engine = new ReactionEngine(reducedCatalog, controller, {
      now: () => 0,
    });

    let threw = false;
    try {
      engine.handleEvent(thinking());
    } catch {
      threw = true;
    }

    expect({ threw, calls }).toEqual({ threw: false, calls: [] });
  });

  it('un catalogo vacio no lanza excepcion ni llama al avatar para ningun evento', () => {
    const { controller, calls } = createAvatarSpy();
    const engine = new ReactionEngine([], controller, { now: () => 0 });

    let threw = false;
    try {
      engine.handleEvent(toolStarted('Bash'));
    } catch {
      threw = true;
    }

    expect({ threw, calls }).toEqual({ threw: false, calls: [] });
  });

  it('resolveReaction en tool_finished con success:false selecciona la reaccion de error, no la de exito', () => {
    const reaction = resolveReaction(REACTION_CATALOG, toolFinished(false));

    expect(reaction?.id).toBe('resultado-error-recuperable');
  });
});

describe('Hallazgo 13 — un bloqueo de seguridad no queda invisible tras su tool_result de error', () => {
  it('permission_denied seguido de inmediato por tool_finished:false no reemplaza alarmada por error-recuperable', () => {
    let currentTime = 0;
    const { controller, calls } = createAvatarSpy();
    const engine = new ReactionEngine(REACTION_CATALOG, controller, {
      now: () => currentTime,
    });

    engine.handleEvent(permissionDenied('Bash'));
    engine.handleEvent(toolFinished(false, 't1'));

    expect(calls).toEqual(['setState:alarmada', 'setExpression:surprised']);
  });

  it('alarmada decae sola tras su durationMs y deja pasar una reaccion de menor prioridad', () => {
    let currentTime = 0;
    const { controller, calls } = createAvatarSpy();
    const engine = new ReactionEngine(REACTION_CATALOG, controller, {
      now: () => currentTime,
    });

    engine.handleEvent(permissionDenied('Bash'));
    calls.length = 0;
    currentTime = 5000;
    engine.handleEvent(fileRead('a.ts'));

    expect(calls).not.toEqual([]);
    expect(calls).not.toContain('setState:alarmada');
  });

  it('un evento genuinamente mas grave (peticion de permiso, prioridad 95) si interrumpe a alarmada (59)', () => {
    let currentTime = 0;
    const { controller, calls } = createAvatarSpy();
    const engine = new ReactionEngine(REACTION_CATALOG, controller, {
      now: () => currentTime,
    });

    engine.handleEvent(permissionDenied('Bash'));
    calls.length = 0;
    engine.handleEvent({
      type: 'interaction_required',
      text: 'necesito permiso',
    });

    expect(calls).toContain('setState:waiting_permission');
  });
});

describe('ReactionEngine — happy path', () => {
  it('secuencia realista: tool_started activa exploracion, y tras el cooldown tool_finished exitoso activa el estado de exito', () => {
    let currentTime = 0;
    const { controller, calls } = createAvatarSpy();
    const engine = new ReactionEngine(REACTION_CATALOG, controller, {
      now: () => currentTime,
    });

    engine.handleEvent(toolStarted('Read'));
    currentTime = 10000;
    engine.handleEvent(toolFinished(true));

    expect(calls).toEqual([
      'setState:explorando',
      'setExpression:neutral',
      'setState:success',
      'setExpression:happy',
    ]);
  });
});

function turnComplete(text: string): NormalizedEvent {
  return { type: 'assistant_turn_complete', text };
}

function createTtsSpy(): { textToSpeech: TextToSpeech; spoken: string[] } {
  const spoken: string[] = [];
  const textToSpeech: TextToSpeech = {
    speak: async (text) => {
      spoken.push(text);
    },
    stop: () => {},
    pause: () => {},
    resume: () => {},
  };
  return { textToSpeech, spoken };
}

describe('respuesta-hablada (Hito 6) — casos adversos', () => {
  it('sin textToSpeech configurado (voz nunca inicializada), no truena y no reproduce nada', () => {
    const { controller } = createAvatarSpy();
    const engine = new ReactionEngine(REACTION_CATALOG, controller);

    expect(() => engine.handleEvent(turnComplete('hola'))).not.toThrow();
  });

  it('turno con texto vacio no dispara speak con string vacio', async () => {
    const { controller } = createAvatarSpy();
    const { textToSpeech, spoken } = createTtsSpy();
    const engine = new ReactionEngine(REACTION_CATALOG, controller, {
      textToSpeech,
    });

    engine.handleEvent(turnComplete(''));
    await Promise.resolve();

    expect(spoken).toEqual([]);
  });

  it('dos respuestas seguidas DENTRO de la ventana de agrupacion (2500ms): la segunda se suprime, mismo id de reaccion', async () => {
    let currentTime = 0;
    const { controller } = createAvatarSpy();
    const { textToSpeech, spoken } = createTtsSpy();
    const engine = new ReactionEngine(REACTION_CATALOG, controller, {
      textToSpeech,
      now: () => currentTime,
    });

    engine.handleEvent(turnComplete('primera respuesta'));
    currentTime = 1000;
    engine.handleEvent(turnComplete('segunda respuesta'));
    await Promise.resolve();

    expect(spoken).toEqual(['primera respuesta']);
  });

  it('dos respuestas separadas por mas de la ventana de agrupacion si disparan ambas, en orden', async () => {
    let currentTime = 0;
    const { controller } = createAvatarSpy();
    const { textToSpeech, spoken } = createTtsSpy();
    const engine = new ReactionEngine(REACTION_CATALOG, controller, {
      textToSpeech,
      now: () => currentTime,
    });

    engine.handleEvent(turnComplete('primera respuesta'));
    currentTime = 4000;
    engine.handleEvent(turnComplete('segunda respuesta'));
    await Promise.resolve();

    expect(spoken).toEqual(['primera respuesta', 'segunda respuesta']);
  });
});

describe('respuesta-hablada (Hito 6) — happy path', () => {
  it('con voz configurada, un turno real dispara speak() exactamente una vez con el texto exacto del turno', async () => {
    const { controller } = createAvatarSpy();
    const { textToSpeech, spoken } = createTtsSpy();
    const engine = new ReactionEngine(REACTION_CATALOG, controller, {
      textToSpeech,
    });

    engine.handleEvent(turnComplete('Listo, ya revise el archivo.'));
    await Promise.resolve();

    expect(spoken).toEqual(['Listo, ya revise el archivo.']);
  });
});
