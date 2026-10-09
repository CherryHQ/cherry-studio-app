import type { Api, Model } from '@earendil-works/pi-ai';
import { CompactionEntry, UserEntry } from '@earendil-works/pi-durable';

import type { RuntimeExecutionRequest } from '../../types';
import { PI_CONTEXT_CHECKPOINT_KIND } from '../piLegacyCheckpoint';
import { createLegacyPiEntries } from '../piLegacyHistory';

const model: Model<Api> = {
  id: 'model',
  provider: 'provider',
  api: 'openai-responses',
  name: 'Model',
  baseUrl: '',
  contextWindow: 32768,
  maxTokens: 4096,
  input: ['text'],
  reasoning: false,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

function request(): RuntimeExecutionRequest {
  return {
    sessionId: 'session',
    turnId: 'new-turn',
    model: { providerId: 'provider', modelId: 'model' },
    instructions: 'Help the user.',
    input: [{ type: 'text', text: 'New input, not imported.' }],
    history: [
      {
        turnId: 'recent',
        messages: [
          { role: 'user', parts: [{ type: 'text', text: 'Keep the blue theme.' }] },
          { role: 'assistant', parts: [{ type: 'text', text: 'Agreed.' }] },
        ],
      },
    ],
    contextCheckpoint: {
      version: 1,
      anchorTurnId: 'summarized',
      payload: {
        kind: PI_CONTEXT_CHECKPOINT_KIND,
        summary: 'Earlier preferences.',
        tokensBefore: 8000,
      },
    },
    options: {},
    tools: [],
  };
}

describe('legacy Pi history handoff', () => {
  test('reuses a saved summary and preserves the original recent tail without admitting new input', () => {
    const entries = createLegacyPiEntries(request(), model);
    expect(entries[0]).toMatchObject({ kind: CompactionEntry.kind, head: 'self' });
    expect(entries[0]?.model?.[0]).toMatchObject({
      content: expect.stringContaining('Earlier preferences.'),
    });
    expect(entries[1]).toMatchObject({
      kind: UserEntry.kind,
      model: [{ content: 'Keep the blue theme.' }],
    });
    expect(entries).toHaveLength(3);
    expect(JSON.stringify(entries)).not.toContain('New input, not imported.');
  });

  test('retains a whole reconstructed turn when a split offset addressed the unavailable native replay', () => {
    const input = request();
    input.contextCheckpoint!.payload = {
      kind: PI_CONTEXT_CHECKPOINT_KIND,
      summary: 'Earlier preferences.',
      tokensBefore: 8000,
      resume: { turnId: 'recent', messageOffset: 1, replayKind: 'pi-turn-replay-v1' },
    };
    const entries = createLegacyPiEntries(input, model);
    expect(entries[1]?.model?.[0]).toMatchObject({ content: 'Keep the blue theme.' });
    expect(entries).toHaveLength(3);
  });

  test('refuses a corrupt summary or a missing split point instead of losing a trimmed prefix', () => {
    const input = request();
    input.contextCheckpoint!.payload = { kind: PI_CONTEXT_CHECKPOINT_KIND, summary: '' };
    expect(() => createLegacyPiEntries(input, model)).toThrow('valid Pi summary');
    input.contextCheckpoint!.payload = {
      kind: PI_CONTEXT_CHECKPOINT_KIND,
      summary: 'Earlier preferences.',
      tokensBefore: 8000,
      resume: { turnId: 'missing-turn', messageOffset: 1 },
    };
    expect(() => createLegacyPiEntries(input, model)).toThrow('split point is missing');
  });
});
