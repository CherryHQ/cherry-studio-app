import type { AgentMessageView } from '@/shared/contracts/agent';

import { __testing } from '../useAgentMessageHistoryWindow';

function message(id: string): AgentMessageView {
  return {
    createdAt: '2026-08-25T00:00:00.000Z',
    id,
    parts: [],
    role: 'assistant',
    sessionId: 'session-1',
    status: 'success',
    turnId: 'turn-1',
    updatedAt: '2026-08-25T00:00:00.000Z',
    usage: null,
    modelId: null,
    inferenceSnapshot: null,
  };
}

describe('Agent Session message history', () => {
  test('reverses newest-first cursor pages into one chronological transcript', () => {
    expect(
      __testing.flattenMessagePages([
        { items: [message('4'), message('3')], nextCursor: 'older' },
        { items: [message('2'), message('1')] },
      ]),
    ).toEqual([message('1'), message('2'), message('3'), message('4')]);
  });
});
