import { describe, expect, it } from 'vitest';
import {
  REACTION_CATALOG,
  VALID_CLAUDE_EVENT_TYPES,
  validateCatalog,
  type AvatarReactionDefinition,
  type ClaudeEventType,
} from './reaction-catalog';
import { ReactionEngine, resolveReaction } from './reaction-engine';
import type { AvatarController } from './avatar-controller';
import type { NormalizedEvent } from './claude-transport';

function representativeEventsFor(type: ClaudeEventType): NormalizedEvent[] {
  switch (type) {
    case 'session_started':
      return [{ type, session_id: 's1', sendable_commands: [] }];
    case 'session_finished':
      return [
        {
          type,
          session_id: 's1',
          is_error: false,
          stop_reason: null,
          total_cost_usd: 0,
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      ];
    case 'assistant_message':
      return [{ type, text: 'hola' }];
    case 'assistant_turn_complete':
      return [{ type, text: 'hola' }];
    case 'thinking':
      return [{ type }];
    case 'file_read':
      return [{ type, path: 'a.ts' }];
    case 'file_modified':
      return [{ type, path: 'a.ts' }];
    case 'command_started':
      return [{ type, command: 'npm test', id: 'c1' }];
    case 'tool_started':
      return [{ type, name: 'Read', id: 't1' }];
    case 'tool_finished':
      return [
        { type, success: true, tool_use_id: 't1' },
        { type, success: false, tool_use_id: 't1' },
      ];
    case 'interaction_required':
      return [{ type, text: 'necesito ayuda' }];
    case 'permission_denied':
      return [{ type, tool_name: 'Bash' }];
    case 'unclassified':
      return [{ type, raw: 'ruido' }];
  }
}

describe('validateCatalog — casos adversos', () => {
  it('detecta el id de una entrada cuyo trigger no pertenece a los 12 tipos validos', () => {
    const catalog: AvatarReactionDefinition[] = [
      {
        id: 'entrada-valida',
        triggers: ['tool_started'],
        priority: 10,
        speechPolicy: 'never',
        interruptible: true,
      },
      {
        id: 'entrada-con-trigger-invalido',
        triggers: ['evento_que_no_existe' as ClaudeEventType],
        priority: 10,
        speechPolicy: 'never',
        interruptible: true,
      },
    ];

    expect(validateCatalog(catalog)).toEqual(['entrada-con-trigger-invalido']);
  });

  it('devuelve un array vacio para un catalogo vacio', () => {
    expect(validateCatalog([])).toEqual([]);
  });
});

describe('validateCatalog — happy path', () => {
  it('el catalogo real REACTION_CATALOG no contiene ningun trigger fuera de los 13 tipos validos', () => {
    expect(validateCatalog(REACTION_CATALOG)).toEqual([]);
  });
});

describe('permission_denied vs. ruido de infraestructura (Hallazgo 1)', () => {
  it('ninguna entrada del catalogo escucha unclassified — ruido de infraestructura ya no se ve como "no entendi"', () => {
    const entradasConUnclassified = REACTION_CATALOG.filter((entry) =>
      entry.triggers.includes('unclassified'),
    );
    expect(entradasConUnclassified).toEqual([]);
  });

  it('mental-alarmada escucha permission_denied — un bloqueo real de seguridad si es visible', () => {
    const alarmada = REACTION_CATALOG.find(
      (entry) => entry.id === 'mental-alarmada',
    );
    expect(alarmada?.triggers).toContain('permission_denied');
  });
});

describe('cobertura completa del catalogo — Hito 2 (lanzamiento-publico)', () => {
  it('cada entrada con triggers reales gana su evento representativo, o declara explicitamente por que no en su fallback', () => {
    const winnerIds = new Set<string>();
    for (const type of VALID_CLAUDE_EVENT_TYPES) {
      for (const event of representativeEventsFor(type)) {
        const winner = resolveReaction(REACTION_CATALOG, event);
        if (winner) winnerIds.add(winner.id);
      }
    }

    const perdedoresSinJustificar = REACTION_CATALOG.filter(
      (reaction) =>
        reaction.triggers.length > 0 &&
        !winnerIds.has(reaction.id) &&
        !reaction.fallback,
    );

    expect(perdedoresSinJustificar.map((reaction) => reaction.id)).toEqual([]);
  });

  it('tool_finished resuelve por outcome (exito/fallo), no solo por prioridad cruda', () => {
    expect(
      resolveReaction(REACTION_CATALOG, {
        type: 'tool_finished',
        success: true,
        tool_use_id: 't1',
      })?.id,
    ).toBe('resultado-operacion-exitosa');
    expect(
      resolveReaction(REACTION_CATALOG, {
        type: 'tool_finished',
        success: false,
        tool_use_id: 't1',
      })?.id,
    ).toBe('resultado-error-recuperable');
  });

  it('toda entrada sin triggers (inalcanzable por evento) documenta explicitamente por que en su fallback', () => {
    const sinJustificar = REACTION_CATALOG.filter(
      (reaction) => reaction.triggers.length === 0 && !reaction.fallback,
    );

    expect(sinJustificar.map((reaction) => reaction.id)).toEqual([]);
  });

  it('no hay ids duplicados en el catalogo', () => {
    const ids = REACTION_CATALOG.map((reaction) => reaction.id);
    const duplicados = ids.filter((id, index) => ids.indexOf(id) !== index);

    expect(duplicados).toEqual([]);
  });
});

describe('decaimiento de reacciones de resultado (Hallazgo 2)', () => {
  function createAvatarSpy(): {
    controller: AvatarController;
    calls: string[];
  } {
    const calls: string[] = [];
    const controller: AvatarController = {
      setState: (state) => calls.push(`setState:${state}`),
      setExpression: (expression) => calls.push(`setExpression:${expression}`),
      speak: async () => {},
      stopSpeaking: () => {},
    };
    return { controller, calls };
  }

  it.each([
    'resultado-operacion-exitosa',
    'resultado-cambio-aplicado',
    'resultado-error-recuperable',
    'resultado-sesion-finalizada',
    'mental-dormida',
  ])(
    '%s tiene durationMs definido — ya no se queda pegado para siempre',
    (id) => {
      const entry = REACTION_CATALOG.find((reaction) => reaction.id === id);
      expect(entry?.durationMs).toBeGreaterThan(0);
    },
  );

  it('sin decaimiento, un evento de menor prioridad quedaria bloqueado para siempre tras un exito (reproduce el Hallazgo 2)', () => {
    let currentTime = 0;
    const { controller, calls } = createAvatarSpy();
    const engine = new ReactionEngine(REACTION_CATALOG, controller, {
      now: () => currentTime,
    });

    engine.handleEvent({
      type: 'tool_finished',
      success: true,
    } as NormalizedEvent);
    currentTime = 200; // muy antes de que expire resultado-operacion-exitosa (durationMs: 5000)
    engine.handleEvent({ type: 'thinking' } as NormalizedEvent); // tecnica-planificando, prioridad 20 (mucho menor que 60)

    expect(calls.filter((call) => call === 'setState:success')).toHaveLength(1);
    expect(calls).not.toContain('setState:planificando');
  });

  it('tras la ventana de durationMs, un evento de menor prioridad si logra activarse — el avatar deja de quedar pegado en exito', () => {
    let currentTime = 0;
    const { controller, calls } = createAvatarSpy();
    const engine = new ReactionEngine(REACTION_CATALOG, controller, {
      now: () => currentTime,
    });

    engine.handleEvent({
      type: 'tool_finished',
      success: true,
    } as NormalizedEvent);
    currentTime = 6000; // despues de que expire resultado-operacion-exitosa (durationMs: 5000)
    engine.handleEvent({ type: 'thinking' } as NormalizedEvent);

    expect(calls).toContain('setState:planificando');
  });
});
