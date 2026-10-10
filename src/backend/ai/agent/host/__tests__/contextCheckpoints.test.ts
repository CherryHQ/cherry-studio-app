import {
  MAX_RUNTIME_CONTEXT_CHECKPOINT_BYTES,
  validateRuntimeContextCheckpointCandidate,
} from '../contextCheckpoints';

describe('Runtime context checkpoints', () => {
  test('accepts a valid candidate', () => {
    const checkpoint = {
      version: 1 as const,
      anchorTurnId: 'turn-1',
      payload: { summary: 'one' },
    };

    expect(validateRuntimeContextCheckpointCandidate(checkpoint)).toEqual({
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

  test('rejects an oversized payload without truncating it', () => {
    const checkpoint = {
      version: 1 as const,
      anchorTurnId: 'turn-1',
      payload: 'x'.repeat(MAX_RUNTIME_CONTEXT_CHECKPOINT_BYTES),
    };

    expect(validateRuntimeContextCheckpointCandidate(checkpoint)).toEqual({
      checkpoint: null,
      issue: 'CONTEXT_CHECKPOINT_TOO_LARGE',
    });
    expect(checkpoint.payload).toHaveLength(MAX_RUNTIME_CONTEXT_CHECKPOINT_BYTES);
  });
});
