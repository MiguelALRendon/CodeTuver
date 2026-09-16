import { describe, expect, it } from 'vitest';
import type { NormalizedEvent } from './claude-transport';
import {
  applyChatEvent,
  chatEntries,
  createChatState,
  createSessionUsage,
  recordPersonMessage,
  shouldShowWorkingIndicator,
} from './chat';

function assistantMessage(text: string): NormalizedEvent {
  return { type: 'assistant_message', text };
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

function permissionDenied(toolName: string): NormalizedEvent {
  return { type: 'permission_denied', tool_name: toolName };
}

function sessionFinished(
  usage: {
    totalCostUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  } = {},
): NormalizedEvent {
  return {
    type: 'session_finished',
    session_id: 's1',
    is_error: false,
    stop_reason: null,
    total_cost_usd: usage.totalCostUsd ?? 0,
    input_tokens: usage.inputTokens ?? 0,
    output_tokens: usage.outputTokens ?? 0,
    cache_creation_input_tokens: usage.cacheCreationInputTokens ?? 0,
    cache_read_input_tokens: usage.cacheReadInputTokens ?? 0,
  };
}

describe('chat — casos adversos', () => {
  it('muestra el turno abierto con los bloques ya completados sin esperar a que cierre', () => {
    const state = applyChatEvent(
      createChatState(),
      assistantMessage('Primera parte completa.\n\nSegunda parte incompleta'),
    );

    expect(chatEntries(state)).toEqual([
      {
        role: 'agent',
        blocks: [{ type: 'paragraph', text: 'Primera parte completa.' }],
      },
    ]);
  });

  it('cierra el turno de agente abierto (con el buffer pendiente incluido) antes de registrar el nuevo mensaje de la persona', () => {
    const withOpenTurn = applyChatEvent(
      createChatState(),
      assistantMessage('Primera parte completa.\n\nSegunda parte incompleta'),
    );

    const state = recordPersonMessage(withOpenTurn, 'Siguiente instruccion');

    expect(state).toEqual({
      closedEntries: [
        {
          role: 'agent',
          blocks: [
            { type: 'paragraph', text: 'Primera parte completa.' },
            { type: 'paragraph', text: 'Segunda parte incompleta' },
          ],
        },
        { role: 'person', text: 'Siguiente instruccion' },
      ],
      openTurn: null,
      usage: createSessionUsage(),
    });
  });

  it('cierra el turno abierto al recibir session_finished sin que llegue un mensaje de la persona', () => {
    const withOpenTurn = applyChatEvent(
      createChatState(),
      assistantMessage('Todo listo.\n\n'),
    );

    const state = applyChatEvent(withOpenTurn, sessionFinished());

    expect(state).toEqual({
      closedEntries: [
        { role: 'agent', blocks: [{ type: 'paragraph', text: 'Todo listo.' }] },
      ],
      openTurn: null,
      usage: createSessionUsage(),
    });
  });

  it('ignora eventos sin relevancia para el chat (session_started, thinking, unclassified) sin abrir turno', () => {
    const irrelevantEvents: NormalizedEvent[] = [
      { type: 'session_started', session_id: 's1', sendable_commands: [] },
      { type: 'thinking' },
      { type: 'unclassified', raw: 'ruido' },
    ];

    const state = irrelevantEvents.reduce(applyChatEvent, createChatState());

    expect(state).toEqual(createChatState());
  });

  it('refleja un tool_started seguido de su tool_finished como un bloque command resuelto en el turno abierto', () => {
    const state = [toolStarted('Read'), toolFinished(true)].reduce(
      applyChatEvent,
      createChatState(),
    );

    expect(chatEntries(state)).toEqual([
      {
        role: 'agent',
        blocks: [
          {
            type: 'command',
            command: 'Read',
            status: 'success',
            isShellCommand: false,
          },
        ],
      },
    ]);
  });

  it('un comando bloqueado por permiso queda "failed" dentro del turno de chat, no ausente (Hallazgo 14)', () => {
    const state = [
      commandStarted('del README.md'),
      permissionDenied('Bash'),
    ].reduce(applyChatEvent, createChatState());

    expect(chatEntries(state)).toEqual([
      {
        role: 'agent',
        blocks: [
          {
            type: 'command',
            command: 'del README.md',
            status: 'failed',
            isShellCommand: true,
          },
        ],
      },
    ]);
  });

  it('session_finished resuelve como "failed" cualquier bloque que siga pendiente al cerrar el turno (red de seguridad)', () => {
    const withOpenTurn = applyChatEvent(
      createChatState(),
      commandStarted('npm test'),
    );

    const state = applyChatEvent(withOpenTurn, sessionFinished());

    expect(state).toEqual({
      closedEntries: [
        {
          role: 'agent',
          blocks: [
            {
              type: 'command',
              command: 'npm test',
              status: 'failed',
              isShellCommand: true,
            },
          ],
        },
      ],
      openTurn: null,
      usage: createSessionUsage(),
    });
  });

  it('mantiene el orden y la alternancia de roles tras tres intercambios completos persona-agente', () => {
    const afterFirstMessage = recordPersonMessage(createChatState(), 'Hola');
    const afterFirstReply = applyChatEvent(
      afterFirstMessage,
      assistantMessage('Respuesta uno.\n\n'),
    );
    const afterSecondMessage = recordPersonMessage(
      afterFirstReply,
      'Como estas?',
    );
    const afterSecondReply = applyChatEvent(
      afterSecondMessage,
      assistantMessage('Respuesta dos.\n\n'),
    );
    const state = recordPersonMessage(afterSecondReply, 'Genial');

    expect(chatEntries(state).map((entry) => entry.role)).toEqual([
      'person',
      'agent',
      'person',
      'agent',
      'person',
    ]);
  });

  it('produce la entrada final del agente con parrafo, comando exitoso y turno cerrado tras un flujo completo', () => {
    const withMessage = applyChatEvent(
      createChatState(),
      assistantMessage('Voy a revisar el codigo.\n\n'),
    );
    const withTool = [toolStarted('Read'), toolFinished(true)].reduce(
      applyChatEvent,
      withMessage,
    );

    const state = applyChatEvent(withTool, sessionFinished());

    expect(state).toEqual({
      closedEntries: [
        {
          role: 'agent',
          blocks: [
            { type: 'paragraph', text: 'Voy a revisar el codigo.' },
            {
              type: 'command',
              command: 'Read',
              status: 'success',
              isShellCommand: false,
            },
          ],
        },
      ],
      openTurn: null,
      usage: createSessionUsage(),
    });
  });
});

describe('sessionUsage — H14', () => {
  it('arranca en cero desde createChatState', () => {
    expect(createChatState().usage).toEqual(createSessionUsage());
  });

  it('acumula tokens y costo a traves de varios turnos', () => {
    const afterFirstTurn = applyChatEvent(
      createChatState(),
      sessionFinished({
        totalCostUsd: 0.01,
        inputTokens: 10,
        outputTokens: 20,
        cacheCreationInputTokens: 5,
        cacheReadInputTokens: 3,
      }),
    );
    const afterSecondTurn = applyChatEvent(
      afterFirstTurn,
      sessionFinished({
        totalCostUsd: 0.02,
        inputTokens: 7,
        outputTokens: 9,
        cacheCreationInputTokens: 1,
        cacheReadInputTokens: 2,
      }),
    );

    expect(afterSecondTurn.usage).toEqual({
      totalCostUsd: 0.03,
      inputTokens: 17,
      outputTokens: 29,
      cacheCreationInputTokens: 6,
      cacheReadInputTokens: 5,
    });
  });
});

describe('shouldShowWorkingIndicator — H12', () => {
  it('no se muestra si no se esta enviando, aunque no haya turno abierto', () => {
    expect(shouldShowWorkingIndicator(createChatState(), false)).toBe(false);
  });

  it('se muestra mientras se envia y el turno abierto todavia no tiene bloques', () => {
    expect(shouldShowWorkingIndicator(createChatState(), true)).toBe(true);
  });

  it('se retira en cuanto llega el primer bloque real del turno abierto', () => {
    const state = applyChatEvent(createChatState(), toolStarted('Read'));

    expect(shouldShowWorkingIndicator(state, true)).toBe(false);
  });
});
