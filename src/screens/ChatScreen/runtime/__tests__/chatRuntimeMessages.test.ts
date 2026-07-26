import type { CherryMessagePart, Message } from '@/data/types/message';

import {
  denyPendingToolApprovals,
  getPendingToolApprovals,
  hasPendingToolApproval,
  mergeMessageStats,
  mergeMessagesWithOverlay,
  statsFromMetadata,
} from '../chatRuntimeMessages';

describe('statsFromMetadata', () => {
  test('projects present token fields, dropping absent ones', () => {
    expect(
      statsFromMetadata({ totalTokens: 150, promptTokens: 100, completionTokens: 50 }),
    ).toEqual({
      totalTokens: 150,
      promptTokens: 100,
      completionTokens: 50,
    });
  });

  test('includes thoughtsTokens when present', () => {
    expect(statsFromMetadata({ totalTokens: 10, thoughtsTokens: 4 })).toEqual({
      totalTokens: 10,
      thoughtsTokens: 4,
    });
  });

  test('returns undefined for undefined metadata', () => {
    expect(statsFromMetadata(undefined)).toBeUndefined();
  });

  test('returns undefined when metadata has no token fields', () => {
    expect(statsFromMetadata({ modelId: 'gpt-5' })).toBeUndefined();
  });
});

describe('chat runtime messages', () => {
  test('replaces a persisted placeholder with the streaming overlay', () => {
    const userMessage = createMessage('user-1', 'user');
    const placeholder = createMessage('assistant-1', 'assistant');
    const overlay = {
      ...placeholder,
      data: { parts: [{ type: 'text', text: 'streaming' }] },
    } as Message;

    expect(mergeMessagesWithOverlay([userMessage, placeholder], overlay)).toEqual([
      userMessage,
      overlay,
    ]);
  });

  test('appends the streaming overlay when the placeholder page has not refetched yet', () => {
    const userMessage = createMessage('user-1', 'user');
    const overlay = createMessage('assistant-1', 'assistant');

    expect(mergeMessagesWithOverlay([userMessage], overlay)).toEqual([userMessage, overlay]);
  });
});

describe('tool approvals', () => {
  const requested = (approvalId: string, toolName = 'search'): CherryMessagePart =>
    ({
      approval: { id: approvalId },
      input: { q: 'x' },
      state: 'approval-requested',
      toolCallId: `call-${approvalId}`,
      toolName,
      type: 'dynamic-tool',
    }) as unknown as CherryMessagePart;
  const textPart: CherryMessagePart = { text: 'hello', type: 'text' };

  test('hasPendingToolApproval only fires on approval-requested tool parts', () => {
    expect(hasPendingToolApproval([textPart])).toBe(false);
    expect(
      hasPendingToolApproval([
        { state: 'output-available', type: 'dynamic-tool' } as unknown as CherryMessagePart,
      ]),
    ).toBe(false);
    expect(hasPendingToolApproval([textPart, requested('a1')])).toBe(true);
  });

  test('denyPendingToolApprovals flips only requested parts and carries the reason', () => {
    const responded = {
      approval: { approved: true, id: 'done' },
      state: 'approval-responded',
      type: 'dynamic-tool',
    } as unknown as CherryMessagePart;

    const parts = denyPendingToolApprovals([textPart, requested('a1'), responded], 'aborted');

    expect(parts[0]).toBe(textPart);
    expect(parts[1]).toMatchObject({
      approval: { approved: false, id: 'a1', reason: 'aborted' },
      state: 'approval-responded',
    });
    expect(parts[2]).toBe(responded);
  });

  test('getPendingToolApprovals only reads a paused assistant tip', () => {
    const paused = {
      ...createMessage('assistant-1', 'assistant'),
      data: { parts: [requested('a1'), requested('a2', 'create')] },
      status: 'paused' as const,
    };

    expect(getPendingToolApprovals([createMessage('user-1', 'user'), paused])).toEqual([
      expect.objectContaining({ approvalId: 'a1', messageId: 'assistant-1', toolName: 'search' }),
      expect.objectContaining({ approvalId: 'a2', toolName: 'create' }),
    ]);
    // Streaming overlays force status pending — must not summon the sheet.
    expect(getPendingToolApprovals([{ ...paused, status: 'pending' }])).toEqual([]);
    // Only the tip counts: an older paused row is not actionable.
    expect(getPendingToolApprovals([paused, createMessage('user-2', 'user')])).toEqual([]);
  });

  test('mergeMessageStats adds counters and keeps the latest timings', () => {
    expect(mergeMessageStats(undefined, { totalTokens: 5 })).toEqual({ totalTokens: 5 });
    expect(mergeMessageStats({ totalTokens: 5 }, undefined)).toEqual({ totalTokens: 5 });
    expect(
      mergeMessageStats(
        { completionTokens: 10, timeFirstTokenMs: 100, totalTokens: 30 },
        { completionTokens: 7, timeFirstTokenMs: 40, totalTokens: 12 },
      ),
    ).toEqual({ completionTokens: 17, timeFirstTokenMs: 40, totalTokens: 42 });
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
