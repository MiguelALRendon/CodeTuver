import { describe, expect, it } from 'vitest';
import type { ClaudeActivity, NormalizedEvent } from './claude-transport';
import {
  appendRawActivity,
  createActivityConsoleState,
  handleNormalizedEvent,
  resumeActivityConsoleState,
} from './activity-console';

function toolStarted(name: string, id: string): NormalizedEvent {
  return { type: 'tool_started', name, id };
}

function toolFinished(success: boolean, toolUseId: string): NormalizedEvent {
  return { type: 'tool_finished', success, tool_use_id: toolUseId };
}

function commandStarted(command: string, id: string): NormalizedEvent {
  return { type: 'command_started', command, id };
}

function permissionDenied(toolName: string): NormalizedEvent {
  return { type: 'permission_denied', tool_name: toolName };
}

function sessionFinished(): NormalizedEvent {
  return {
    type: 'session_finished',
    session_id: 's1',
    is_error: false,
    stop_reason: null,
    total_cost_usd: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
}

describe('handleNormalizedEvent — casos adversos', () => {
  it('no pierde eventos cuando se consulta el estado a mitad de una operacion pendiente', () => {
    const initial = createActivityConsoleState();
    const withoutPeek = handleNormalizedEvent(
      handleNormalizedEvent(initial, toolStarted('Read', 't1')),
      toolFinished(true, 't1'),
    );
    const midway = handleNormalizedEvent(initial, toolStarted('Read', 't1'));
    void midway.blocks.length;
    const withPeek = handleNormalizedEvent(midway, toolFinished(true, 't1'));

    expect(withPeek).toEqual(withoutPeek);
  });

  it('ignora un tool_finished sin ningun tool_started pendiente sin lanzar excepcion', () => {
    const state = createActivityConsoleState();

    const result = handleNormalizedEvent(state, toolFinished(true, 't1'));

    expect(result).toEqual(state);
  });

  it('un tool_finished con un tool_use_id que no coincide con ninguna entrada pendiente no toca la que si esta pendiente', () => {
    const state = handleNormalizedEvent(
      createActivityConsoleState(),
      toolStarted('Read', 't1'),
    );

    const result = handleNormalizedEvent(
      state,
      toolFinished(true, 'id-que-no-existe'),
    );

    expect(result).toEqual(state);
    expect((result.blocks[0] as { status?: string }).status).toBe('running');
  });

  it('resuelve dos tool_use del mismo tipo (ambos comandos) en orden inverso al de inicio, por id — no por FIFO', () => {
    const state = [
      commandStarted('cmdA', 'c-a'),
      commandStarted('cmdB', 'c-b'),
      toolFinished(true, 'c-b'),
      toolFinished(false, 'c-a'),
    ].reduce(handleNormalizedEvent, createActivityConsoleState());

    expect(
      state.blocks.map((block) => (block as { status?: string }).status),
    ).toEqual(['failed', 'success']);
    expect(state.pendingCommandIndices).toEqual([]);
  });

  it('resuelve dos tool_use de tipos distintos (un comando y una herramienta generica) en orden inverso al de inicio', () => {
    const state = [
      toolStarted('Read', 't1'),
      commandStarted('cmdB', 'c1'),
      toolFinished(true, 'c1'),
      toolFinished(false, 't1'),
    ].reduce(handleNormalizedEvent, createActivityConsoleState());

    expect({
      toolStatus: (state.blocks[0] as { status?: string }).status,
      commandStatus: (state.blocks[1] as { status?: string }).status,
      pendingToolIndices: state.pendingToolIndices,
      pendingCommandIndices: state.pendingCommandIndices,
    }).toEqual({
      toolStatus: 'failed',
      commandStatus: 'success',
      pendingToolIndices: [],
      pendingCommandIndices: [],
    });
  });

  it('session_finished resuelve como failed cualquier entrada que siga pendiente en ambas colas', () => {
    const state = [
      toolStarted('Read', 't1'),
      commandStarted('cmdB', 'c1'),
      sessionFinished(),
    ].reduce(handleNormalizedEvent, createActivityConsoleState());

    expect(
      state.blocks.map((block) => (block as { status?: string }).status),
    ).toEqual(['failed', 'failed']);
    expect(state.pendingToolIndices).toEqual([]);
    expect(state.pendingCommandIndices).toEqual([]);
  });

  it('session_finished no toca bloques ya resueltos antes de que llegara', () => {
    const state = [
      toolStarted('Read', 't1'),
      toolFinished(true, 't1'),
      sessionFinished(),
    ].reduce(handleNormalizedEvent, createActivityConsoleState());

    expect((state.blocks[0] as { status?: string }).status).toBe('success');
  });

  it('agrega en orden los bloques de un assistant_message con multiples bloques sin reemplazar lo ya acumulado', () => {
    const initial = handleNormalizedEvent(createActivityConsoleState(), {
      type: 'file_modified',
      path: 'a.ts',
    });

    const withMessage = handleNormalizedEvent(initial, {
      type: 'assistant_message',
      text: 'Parrafo uno.\n\n| A | B |\n|---|---|\n| 1 | 2 |',
    });

    expect(withMessage.blocks).toEqual([
      { type: 'file_reference', path: 'a.ts', action: 'modify' },
      { type: 'paragraph', text: 'Parrafo uno.' },
      { type: 'table', headers: ['A', 'B'], rows: [['1', '2']] },
    ]);
  });

  it('procesa una secuencia realista completa manteniendo el orden y el resultado final de cada evento', () => {
    const events: NormalizedEvent[] = [
      { type: 'session_started', session_id: 's1', sendable_commands: [] },
      { type: 'assistant_message', text: 'Voy a revisar el archivo.' },
      toolStarted('Read', 't1'),
      toolFinished(true, 't1'),
      { type: 'file_modified', path: 'src/app.ts' },
      commandStarted('npm test', 'c1'),
      toolFinished(false, 'c1'),
    ];

    const finalState = events.reduce(
      handleNormalizedEvent,
      createActivityConsoleState(),
    );

    expect(finalState).toEqual({
      blocks: [
        { type: 'paragraph', text: 'Voy a revisar el archivo.' },
        {
          type: 'command',
          command: 'Read',
          status: 'success',
          isShellCommand: false,
        },
        { type: 'file_reference', path: 'src/app.ts', action: 'modify' },
        {
          type: 'command',
          command: 'npm test',
          status: 'failed',
          isShellCommand: true,
        },
      ],
      pendingToolIndices: [],
      pendingCommandIndices: [],
    });
  });
});

describe('permission_denied resuelve el bloque de comando bloqueado (Hallazgo 3)', () => {
  it('un permission_denied sin ningun comando pendiente no lanza excepcion ni cambia el estado', () => {
    const state = createActivityConsoleState();

    const result = handleNormalizedEvent(state, permissionDenied('Bash'));

    expect(result).toEqual(state);
  });

  it('un bloque de herramienta pendiente (no comando) queda "running" — permission_denied solo resuelve comandos', () => {
    const state = handleNormalizedEvent(
      createActivityConsoleState(),
      toolStarted('Read', 't1'),
    );

    const result = handleNormalizedEvent(state, permissionDenied('Read'));

    expect((result.blocks[0] as { status?: string }).status).toBe('running');
    expect(result.pendingToolIndices).toEqual([{ id: 't1', index: 0 }]);
  });

  it('un comando bloqueado por permiso queda "failed", no "En curso" para siempre', () => {
    const state = [
      commandStarted('del README.md', 'c1'),
      permissionDenied('Bash'),
    ].reduce(handleNormalizedEvent, createActivityConsoleState());

    expect((state.blocks[0] as { status?: string }).status).toBe('failed');
    expect(state.pendingCommandIndices).toEqual([]);
  });
});

describe('resumeActivityConsoleState', () => {
  it('resiembra los bloques de un transcript con uso de herramienta igual que si hubieran llegado en vivo', () => {
    const events: NormalizedEvent[] = [
      { type: 'assistant_message', text: 'reviso el archivo' },
      toolStarted('Read', 't1'),
      toolFinished(true, 't1'),
      commandStarted('npm test', 'c1'),
      toolFinished(true, 'c1'),
    ];

    const resumed = resumeActivityConsoleState(events);
    const live = events.reduce(
      handleNormalizedEvent,
      createActivityConsoleState(),
    );

    expect(resumed).toEqual(live);
    expect(
      resumed.blocks.map((block) => (block as { status?: string }).status),
    ).toEqual([undefined, 'success', 'success']);
    expect(resumed.pendingToolIndices).toEqual([]);
    expect(resumed.pendingCommandIndices).toEqual([]);
  });

  it('lista de eventos vacia produce el estado inicial', () => {
    expect(resumeActivityConsoleState([])).toEqual(
      createActivityConsoleState(),
    );
  });
});

describe('appendRawActivity — casos adversos', () => {
  it('ignora una actividad invalid-line y no la agrega a las lineas', () => {
    const lines = ['linea existente'];

    const result = appendRawActivity(lines, {
      kind: 'invalid-line',
      line: 'linea rota',
      error: 'motivo del fallo',
    } satisfies ClaudeActivity);

    expect(result).toEqual(['linea existente']);
  });
});
