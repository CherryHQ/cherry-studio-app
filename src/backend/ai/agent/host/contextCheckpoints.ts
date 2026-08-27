import { RuntimeContextCheckpointSchema, type RuntimeContextCheckpoint } from '../runtime';

/** Opaque checkpoint payloads are bounded before they cross into SQLite. */
export const MAX_RUNTIME_CONTEXT_CHECKPOINT_BYTES = 256 * 1024;

export type RuntimeContextCheckpointIssueCode =
  | 'CONTEXT_CHECKPOINT_INVALID'
  | 'CONTEXT_CHECKPOINT_VERSION_UNSUPPORTED'
  | 'CONTEXT_CHECKPOINT_ANCHOR_INVALID'
  | 'CONTEXT_CHECKPOINT_TOO_LARGE';

export type RuntimeContextCheckpointValidation =
  | { checkpoint: RuntimeContextCheckpoint; issue: null }
  | { checkpoint: null; issue: RuntimeContextCheckpointIssueCode };

/** Validates the opaque artifact itself; anchor membership is Store-backed. */
export function validateRuntimeContextCheckpointCandidate(
  value: unknown,
): RuntimeContextCheckpointValidation {
  if (typeof value === 'object' && value !== null && 'version' in value && value.version !== 1) {
    return { checkpoint: null, issue: 'CONTEXT_CHECKPOINT_VERSION_UNSUPPORTED' };
  }

  let parsed: ReturnType<typeof RuntimeContextCheckpointSchema.safeParse>;
  try {
    parsed = RuntimeContextCheckpointSchema.safeParse(value);
  } catch {
    return { checkpoint: null, issue: 'CONTEXT_CHECKPOINT_INVALID' };
  }
  if (!parsed.success) {
    return { checkpoint: null, issue: 'CONTEXT_CHECKPOINT_INVALID' };
  }

  let payloadBytes: number;
  try {
    payloadBytes = new TextEncoder().encode(JSON.stringify(parsed.data.payload)).byteLength;
  } catch {
    return { checkpoint: null, issue: 'CONTEXT_CHECKPOINT_INVALID' };
  }
  if (payloadBytes > MAX_RUNTIME_CONTEXT_CHECKPOINT_BYTES) {
    return { checkpoint: null, issue: 'CONTEXT_CHECKPOINT_TOO_LARGE' };
  }

  return { checkpoint: parsed.data, issue: null };
}

export function validateRuntimeContextCheckpoint(
  value: unknown,
  sessionTurnIds: ReadonlySet<string>,
): RuntimeContextCheckpointValidation {
  const validation = validateRuntimeContextCheckpointCandidate(value);
  if (!validation.checkpoint) {
    return validation;
  }
  if (!sessionTurnIds.has(validation.checkpoint.anchorTurnId)) {
    return { checkpoint: null, issue: 'CONTEXT_CHECKPOINT_ANCHOR_INVALID' };
  }
  return validation;
}
