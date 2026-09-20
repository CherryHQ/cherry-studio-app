import type { AgentMessagePart, AgentMessageView } from '@/shared/contracts/agent';

import { retryAssistantParts } from '../turnRetry';

function answer(status: AgentMessageView['status'], parts: AgentMessagePart[]): AgentMessageView {
  return {
    createdAt: '2026-09-20T00:00:00.000Z',
    id: 'assistant-1',
    inferenceSnapshot: null,
    modelId: null,
    parts,
    role: 'assistant',
    sessionId: 'session-1',
    stats: null,
    status,
    turnId: 'turn-1',
    updatedAt: '2026-09-20T00:00:00.000Z',
    usage: null,
  };
}

const completedTool: AgentMessagePart = {
  id: 'tool-search',
  type: 'tool',
  toolCallId: 'search-call',
  toolRef: { source: 'builtin', capabilityId: 'search' },
  providerName: 'search',
  displayName: 'Search',
  state: 'output-available',
  input: { q: 'question' },
  output: { value: { result: 'Found' }, artifacts: [] },
};

describe('retryAssistantParts', () => {
  test('keeps the record through the last completed tool and discards the unfinished tail', () => {
    const retained = retryAssistantParts(
      answer('error', [
        { id: 'text-1', type: 'text', state: 'done', text: 'Searching' },
        completedTool,
        { id: 'text-2', type: 'text', state: 'done', text: 'Half-written answer' },
        {
          id: 'artifact',
          type: 'file',
          fileEntryId: 'file-1',
          mediaType: 'image/png',
          purpose: 'artifact',
        },
        {
          id: 'error-1',
          type: 'error',
          error: { code: 'EXECUTION_FAILED', message: 'boom', retryable: true },
        },
      ]),
    );

    expect(retained).toEqual([
      { id: 'text-1', type: 'text', state: 'done', text: 'Searching' },
      completedTool,
    ]);
  });

  test('drops the previous attempt compaction anchors, which describe a context it is replanning', () => {
    const retained = retryAssistantParts(
      answer('interrupted', [
        {
          id: 'compaction-anchor:turn-1:0',
          type: 'data-compaction-anchor',
          data: { phase: 'in-loop', status: 'done', preTokens: 100_000, postTokens: 20_000 },
        },
        completedTool,
      ]),
    );

    expect(retained).toEqual([completedTool]);
  });

  test('restarts empty when no tool finished or the answer already succeeded', () => {
    const unfinishedTool: AgentMessagePart = {
      ...completedTool,
      state: 'running',
      output: undefined,
    };

    expect(
      retryAssistantParts(
        answer('cancelled', [
          { id: 'text-1', type: 'text', state: 'done', text: 'Thinking' },
          unfinishedTool,
        ]),
      ),
    ).toEqual([]);
    expect(retryAssistantParts(answer('success', [completedTool]))).toEqual([]);
  });
});
