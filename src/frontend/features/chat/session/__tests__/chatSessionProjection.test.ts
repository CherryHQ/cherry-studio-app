import type { CherryMessagePart, Message } from '@cherrystudio/universal/data/types/message';
import { getPendingToolApprovals, mergeMessagesWithOverlay } from '../chatSessionProjection';

describe('chat runtime message projection', () => {
  it('replaces or appends the live overlay', () => {
    const user = createMessage('user-1', 'user');
    const placeholder = createMessage('assistant-1', 'assistant');
    const overlay = {
      ...placeholder,
      data: { parts: [{ text: 'streaming', type: 'text' }] as CherryMessagePart[] },
    };

    expect(mergeMessagesWithOverlay([user, placeholder], overlay)).toEqual([user, overlay]);
    expect(mergeMessagesWithOverlay([user], overlay)).toEqual([user, overlay]);
  });

  it('projects pending approvals from the assistant tip', () => {
    const approval = {
      approval: { id: 'approval-1' },
      input: { query: 'test' },
      state: 'approval-requested',
      toolCallId: 'call-1',
      toolName: 'search',
      type: 'dynamic-tool',
    } as unknown as CherryMessagePart;
    const assistant = {
      ...createMessage('assistant-1', 'assistant'),
      data: { parts: [approval] },
    };

    expect(getPendingToolApprovals([assistant])).toEqual([
      expect.objectContaining({
        approvalId: 'approval-1',
        messageId: 'assistant-1',
        toolName: 'search',
      }),
    ]);
    expect(getPendingToolApprovals([assistant, createMessage('user-2', 'user')])).toEqual([]);
  });
});

function createMessage(id: string, role: Message['role']): Message {
  const now = '2026-05-15T00:00:00.000Z';
  return {
    createdAt: now,
    data: { parts: [] },
    id,
    parentId: role === 'assistant' ? 'user-1' : null,
    role,
    searchableText: '',
    siblingsGroupId: 0,
    status: 'pending',
    topicId: 'topic-1',
    updatedAt: now,
  };
}
