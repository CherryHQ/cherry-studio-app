import type { Api, AssistantMessage, Model } from '@earendil-works/pi-ai';
import { CompactionEntry, ResetEntry, UserEntry } from '@earendil-works/pi-durable';

import type { RuntimeExecutionRequest } from '../../types';
import { PI_CONTEXT_CHECKPOINT_KIND } from '../piLegacyCheckpoint';
import { emptyAssistantMessage } from '../piStreamEvents';
import { createPiContextCheckpoint, createWorkingPiEntries } from '../piWorkingHistory';

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

describe('Cherry history working-copy import', () => {
  test('round-trips signed active context and imports only the following Cherry tail', () => {
    const signed: AssistantMessage = {
      ...emptyAssistantMessage(model),
      content: [{ type: 'thinking', thinking: 'Retained thought', thinkingSignature: 'signature' }],
    };
    const input = request();
    input.contextCheckpoint = createPiContextCheckpoint('summarized', [signed]);
    const entries = createWorkingPiEntries(input, model);
    expect(entries[0]).toEqual({ kind: ResetEntry.kind, head: 'self' });
    expect(entries[1]?.model).toEqual([signed]);
    expect(entries[2]?.model?.[0]).toMatchObject({ content: 'Keep the blue theme.' });
    expect(entries).toHaveLength(4);
    signed.content.length = 0;
    expect(entries[1]?.model?.[0]).toMatchObject({
      content: [{ thinkingSignature: 'signature' }],
    });
  });

  test('persists an empty reset context and rejects oversized checkpoints without trimming history', () => {
    const input = request();
    input.contextCheckpoint = createPiContextCheckpoint('summarized', []);
    expect(createWorkingPiEntries(input, model)[0]).toEqual({
      kind: ResetEntry.kind,
      head: 'self',
    });
    expect(
      createPiContextCheckpoint('summarized', [
        { role: 'user', content: 'x'.repeat(256 * 1024), timestamp: 0 },
      ]),
    ).toBeNull();
    input.contextCheckpoint = null;
    input.history[0].messages[0].parts = [{ type: 'text', text: 'x'.repeat(300_000) }];
    expect(createWorkingPiEntries(input, model)[0]?.model?.[0]).toMatchObject({
      content: 'x'.repeat(300_000),
    });
  });

  test('rejects malformed new context payloads instead of importing a truncated transcript', () => {
    const input = request();
    input.contextCheckpoint!.payload = { kind: 'pi-durable-context-v1', messages: [null] };
    expect(() => createWorkingPiEntries(input, model)).toThrow('invalid message');
  });
  test('reuses a saved summary and preserves the original recent tail without admitting new input', () => {
    const entries = createWorkingPiEntries(request(), model);
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
    const entries = createWorkingPiEntries(input, model);
    expect(entries[1]?.model?.[0]).toMatchObject({ content: 'Keep the blue theme.' });
    expect(entries).toHaveLength(3);
  });

  test('refuses a corrupt summary or a missing split point instead of losing a trimmed prefix', () => {
    const input = request();
    input.contextCheckpoint!.payload = { kind: PI_CONTEXT_CHECKPOINT_KIND, summary: '' };
    expect(() => createWorkingPiEntries(input, model)).toThrow('valid saved context checkpoint');
    input.contextCheckpoint!.payload = {
      kind: PI_CONTEXT_CHECKPOINT_KIND,
      summary: 'Earlier preferences.',
      tokensBefore: 8000,
      resume: { turnId: 'missing-turn', messageOffset: 1 },
    };
    expect(() => createWorkingPiEntries(input, model)).toThrow('split point is missing');
  });
});
