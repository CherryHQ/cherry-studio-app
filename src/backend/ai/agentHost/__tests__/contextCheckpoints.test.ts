import type { RuntimeHistoryTurn } from '@/backend/ai/agent';

import {
  MAX_RUNTIME_CONTEXT_CHECKPOINT_BYTES,
  selectRuntimeContext,
  validateRuntimeContextCheckpoint,
} from '../contextCheckpoints';

const history: RuntimeHistoryTurn[] = [
  {
    turnId: 'turn-1',
    messages: [{ role: 'user', parts: [{ type: 'text', text: 'one' }] }],
  },
  {
    turnId: 'turn-2',
    messages: [{ role: 'user', parts: [{ type: 'text', text: 'two' }] }],
  },
];

describe('Runtime context checkpoints', () => {
  test('replays a valid checkpoint with only complete turns after its anchor', () => {
    const checkpoint = {
      version: 1 as const,
      anchorTurnId: 'turn-1',
      payload: { summary: 'one' },
    };

    expect(selectRuntimeContext(history, checkpoint)).toEqual({
      checkpoint,
      history: [history[1]],
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
    [
      'missing anchor',
      { version: 1, anchorTurnId: 'missing', payload: {} },
      'CONTEXT_CHECKPOINT_ANCHOR_INVALID',
    ],
  ] as const)('falls back to full history for a %s checkpoint', (_name, candidate, issue) => {
    expect(selectRuntimeContext(history, candidate)).toEqual({
      checkpoint: null,
      history,
      issue,
    });
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

  test('keeps the full grouped history byte-equivalent when no checkpoint exists', () => {
    const serialized = JSON.stringify(history);

    const selected = selectRuntimeContext(history, null);

    expect(selected.checkpoint).toBeNull();
    expect(JSON.stringify(selected.history)).toBe(serialized);
  });
});
