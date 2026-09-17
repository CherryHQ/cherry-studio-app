import type { AgentMessageView } from '@/shared/contracts/agent';

import { latestAgentImageResult } from '../agentImageResult';

function result(id: string, overrides: Partial<AgentMessageView> = {}): AgentMessageView {
  return {
    createdAt: '2026-09-01T00:00:00.000Z',
    id,
    inferenceSnapshot: {
      status: 'supported',
      snapshot: {
        version: 1,
        imageGeneration: { mode: 'generate', paramValues: {} },
        model: {
          uniqueModelId: 'provider::image',
          providerId: 'provider',
          modelId: 'image',
          name: 'Image',
        },
        parameters: {},
        tools: [],
      },
    },
    modelId: 'provider::image',
    parts: [
      {
        id: 'file-1',
        type: 'file',
        fileEntryId: `output-${id}`,
        mediaType: 'image/png',
        purpose: 'artifact',
      },
    ],
    role: 'assistant',
    sessionId: 'session-1',
    stats: null,
    status: 'success',
    turnId: `turn-${id}`,
    updatedAt: '2026-09-01T00:00:00.000Z',
    usage: null,
    ...overrides,
  };
}

describe('latestAgentImageResult', () => {
  it('keeps the last successful image through errors, cancellation, and partial streaming outputs', () => {
    const success = result('1');
    expect(
      latestAgentImageResult([
        success,
        result('2', { status: 'error' }),
        result('3', { status: 'cancelled' }),
        result('4', { status: 'streaming' }),
      ]),
    ).toBe(success);
  });

  it('ignores user references and artifacts from ordinary text/tool turns', () => {
    expect(
      latestAgentImageResult([
        result('1', { role: 'user' }),
        result('2', { inferenceSnapshot: null }),
        result('3', {
          parts: [
            {
              id: 'file-1',
              type: 'file',
              fileEntryId: 'input',
              mediaType: 'image/png',
              purpose: 'input-attachment',
            },
          ],
        }),
      ]),
    ).toBeUndefined();
  });

  it('selects by message chronology across persisted and live sources', () => {
    const latest = result('2', { createdAt: '2026-09-02T00:00:00.000Z' });
    expect(latestAgentImageResult([latest, result('3')])).toBe(latest);
  });
});
