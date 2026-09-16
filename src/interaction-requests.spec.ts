import { describe, expect, it } from 'vitest';
import type { InteractionRequest } from './claude-transport';
import {
  createInteractionRequestsState,
  invalidFormFields,
  listInteractionRequests,
  receivePendingRequest,
  resolveRequest,
} from './interaction-requests';

function permissionRequest(requestId: string): InteractionRequest {
  return {
    type: 'permission',
    request_id: requestId,
    tool_name: 'Read',
    input: {},
  };
}

describe('receivePendingRequest — casos adversos', () => {
  it('descarta una variante de type desconocida fuera de las cinco del contrato', () => {
    const state = receivePendingRequest(createInteractionRequestsState(), {
      type: 'algo_inventado',
      request_id: 'x',
    });

    expect(state.pending).toEqual({});
  });

  it('descarta un payload sin request_id sin lanzar excepcion', () => {
    const state = receivePendingRequest(createInteractionRequestsState(), {
      type: 'permission',
      tool_name: 'Read',
      input: {},
    });

    expect(state.pending).toEqual({});
  });

  it('descarta un payload cuyo request_id no es string', () => {
    const state = receivePendingRequest(createInteractionRequestsState(), {
      type: 'confirmation',
      request_id: 42,
      title: 'Confirmar',
    });

    expect(state.pending).toEqual({});
  });

  it('descarta un payload que no es un objeto', () => {
    const state = receivePendingRequest(
      createInteractionRequestsState(),
      'texto plano',
    );

    expect(state.pending).toEqual({});
  });

  it('acepta una choice con una sola opcion igual que cualquier otra choice valida', () => {
    const state = receivePendingRequest(createInteractionRequestsState(), {
      type: 'choice',
      request_id: 'c1',
      title: 'Elige',
      options: ['unica'],
    });

    expect(state.pending.c1).toEqual({
      type: 'choice',
      request_id: 'c1',
      title: 'Elige',
      options: ['unica'],
    });
  });
});

describe('resolveRequest — casos adversos', () => {
  it('no sobreescribe la decision original cuando una peticion ya respondida vuelve a recibir una respuesta', () => {
    const pending = receivePendingRequest(
      createInteractionRequestsState(),
      permissionRequest('p1'),
    );
    const resolvedOnce = resolveRequest(pending, 'p1', {
      type: 'permission',
      allow: true,
    });

    const resolvedTwice = resolveRequest(resolvedOnce, 'p1', {
      type: 'permission',
      allow: false,
    });

    expect(resolvedTwice).toEqual(resolvedOnce);
  });

  it('mantiene la otra peticion pendiente intacta al resolver solo una de dos peticiones simultaneas', () => {
    const withBoth = [permissionRequest('p1'), permissionRequest('p2')].reduce(
      receivePendingRequest,
      createInteractionRequestsState(),
    );

    const state = resolveRequest(withBoth, 'p1', {
      type: 'permission',
      allow: true,
    });

    expect(state.pending).toEqual({ p2: permissionRequest('p2') });
  });

  it('distingue en listInteractionRequests las dos peticiones simultaneas por estado sin mezclarlas', () => {
    const withBoth = [permissionRequest('p1'), permissionRequest('p2')].reduce(
      receivePendingRequest,
      createInteractionRequestsState(),
    );
    const state = resolveRequest(withBoth, 'p1', {
      type: 'permission',
      allow: true,
    });

    const entries = listInteractionRequests(state);

    expect(entries).toEqual([
      { status: 'pending', requestId: 'p2', request: permissionRequest('p2') },
      {
        status: 'resolved',
        requestId: 'p1',
        request: permissionRequest('p1'),
        decision: { type: 'permission', allow: true },
      },
    ]);
  });
});

describe('invalidFormFields — casos adversos', () => {
  it('reporta un campo requerido vacio', () => {
    const result = invalidFormFields(['nombre', 'email'], {
      nombre: 'Ana',
      email: '',
    });

    expect(result).toEqual(['email']);
  });

  it('reporta dos campos invalidos a la vez, contando un valor de solo espacios como invalido', () => {
    const result = invalidFormFields(['a', 'b', 'c'], {
      a: '',
      b: '  ',
      c: 'x',
    });

    expect(result).toEqual(['a', 'b']);
  });
});

describe('flujo completo — happy path', () => {
  it('recibe una permission, la resuelve con allow true y la muestra resuelta con pending vacio', () => {
    const received = receivePendingRequest(
      createInteractionRequestsState(),
      permissionRequest('p1'),
    );
    const state = resolveRequest(received, 'p1', {
      type: 'permission',
      allow: true,
    });

    expect(listInteractionRequests(state)).toEqual([
      {
        status: 'resolved',
        requestId: 'p1',
        request: permissionRequest('p1'),
        decision: { type: 'permission', allow: true },
      },
    ]);
  });
});
