import {
  MAX_RUNTIME_CONTEXT_CHECKPOINT_BYTES,
  validateRuntimeContextCheckpoint,
  validateRuntimeContextCheckpointCandidate,
} from '../contextCheckpoints';

describe('Runtime context checkpoints', () => {
  test('accepts a valid candidate whose anchor belongs to the Session', () => {
    const checkpoint = {
      version: 1 as const,
      anchorTurnId: 'turn-1',
      payload: { summary: 'one' },
    };

    expect(validateRuntimeContextCheckpointCandidate(checkpoint)).toEqual({
      checkpoint,
      issue: null,
    });
    expect(validateRuntimeContextCheckpoint(checkpoint, new Set(['turn-1']))).toEqual({
      checkpoint,
      issue: null,
    });
  });

  test.each([
    ['corrupt', 'not-json', 'CONTEXT_CHECKPOINT_INVALID'],
    [
      'unsupported version',
      { version: 2, anchorTurnId: 'turn-1', payload: {} },
      'CONTEXT_CHECKPOINT_VERSION_UNSUPPORTED',
    ],
  ] as const)('rejects a %s checkpoint candidate', (_name, candidate, issue) => {
    expect(validateRuntimeContextCheckpointCandidate(candidate)).toEqual({
      checkpoint: null,
      issue,
    });
  });

  test('rejects a candidate whose anchor does not belong to the Session', () => {
    expect(
      validateRuntimeContextCheckpoint(
        { version: 1, anchorTurnId: 'missing', payload: {} },
        new Set(['turn-1']),
      ),
    ).toEqual({ checkpoint: null, issue: 'CONTEXT_CHECKPOINT_ANCHOR_INVALID' });
  });

  test('rejects an oversized payload without truncating it', () => {
    const checkpoint = {
      version: 1 as const,
      anchorTurnId: 'turn-1',
      payload: 'x'.repeat(MAX_RUNTIME_CONTEXT_CHECKPOINT_BYTES),
    };

    expect(validateRuntimeContextCheckpoint(checkpoint, new Set(['turn-1']))).toEqual({
      checkpoint: null,
      issue: 'CONTEXT_CHECKPOINT_TOO_LARGE',
    });
    expect(checkpoint.payload).toHaveLength(MAX_RUNTIME_CONTEXT_CHECKPOINT_BYTES);
  });
});
