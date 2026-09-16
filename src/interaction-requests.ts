import type { InteractionRequest } from './claude-transport';

export type InteractionDecision =
  | { type: 'permission'; allow: boolean }
  | { type: 'confirmation'; allow: boolean }
  | { type: 'choice'; selected: string[] }
  | { type: 'open_question'; answer: string }
  | { type: 'form'; values: Record<string, string> };

interface ResolvedInteraction {
  request: InteractionRequest;
  decision: InteractionDecision;
}

export interface InteractionRequestsState {
  pending: Record<string, InteractionRequest>;
  resolved: Record<string, ResolvedInteraction>;
}

export type InteractionRequestEntry =
  | { status: 'pending'; requestId: string; request: InteractionRequest }
  | {
      status: 'resolved';
      requestId: string;
      request: InteractionRequest;
      decision: InteractionDecision;
    };

export function createInteractionRequestsState(): InteractionRequestsState {
  return { pending: {}, resolved: {} };
}

function requestId(request: InteractionRequest): string {
  return request.request_id;
}

const KNOWN_TYPES = new Set([
  'permission',
  'choice',
  'open_question',
  'confirmation',
  'form',
]);

// Frontera de confianza: un payload con `type` fuera del contrato real se descarta, nunca se pinta a ciegas.
function isInteractionRequest(value: unknown): value is InteractionRequest {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { type?: unknown; request_id?: unknown };
  return (
    typeof candidate.type === 'string' &&
    KNOWN_TYPES.has(candidate.type) &&
    typeof candidate.request_id === 'string'
  );
}

export function receivePendingRequest(
  state: InteractionRequestsState,
  payload: unknown,
): InteractionRequestsState {
  if (!isInteractionRequest(payload)) return state;
  return {
    ...state,
    pending: { ...state.pending, [requestId(payload)]: payload },
  };
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

// No-op si `id` ya no esta pendiente: cubre tanto un id desconocido como una peticion ya respondida.
export function resolveRequest(
  state: InteractionRequestsState,
  id: string,
  decision: InteractionDecision,
): InteractionRequestsState {
  const request = state.pending[id];
  if (!request) return state;
  return {
    pending: omitKey(state.pending, id),
    resolved: { ...state.resolved, [id]: { request, decision } },
  };
}

export function countPendingInteractionRequests(
  state: InteractionRequestsState,
): number {
  return Object.keys(state.pending).length;
}

export function listInteractionRequests(
  state: InteractionRequestsState,
): InteractionRequestEntry[] {
  const pending = Object.entries(state.pending).map(([id, request]) => ({
    status: 'pending' as const,
    requestId: id,
    request,
  }));
  const resolved = Object.entries(state.resolved).map(([id, entry]) => ({
    status: 'resolved' as const,
    requestId: id,
    request: entry.request,
    decision: entry.decision,
  }));
  return [...pending, ...resolved];
}

export function invalidFormFields(
  fields: string[],
  values: Record<string, string>,
): string[] {
  return fields.filter((field) => !values[field]?.trim());
}
