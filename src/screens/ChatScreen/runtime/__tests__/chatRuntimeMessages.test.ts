import type { CherryMessagePart, Message } from '@/data/types/message';
import { readCherryMeta } from '@/data/types/uiParts';

import {
  finalizeTurnToolApprovals,
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
  /** `readCherryMeta` is scoped to a part's type; these parts are built by cast. */
  const toolMetaOf = (part: CherryMessagePart) =>
    readCherryMeta(part as Extract<CherryMessagePart, { type: 'dynamic-tool' }>);

  test('hasPendingToolApproval only fires on approval-requested tool parts', () => {
    expect(hasPendingToolApproval([textPart])).toBe(false);
    expect(
      hasPendingToolApproval([
        { state: 'output-available', type: 'dynamic-tool' } as unknown as CherryMessagePart,
      ]),
    ).toBe(false);
    expect(hasPendingToolApproval([textPart, requested('a1')])).toBe(true);
  });

  test('finalizeTurnToolApprovals settles every unresolved approval terminally', () => {
    const approved = {
      approval: { approved: true, id: 'a2' },
      state: 'approval-responded',
      type: 'dynamic-tool',
    } as unknown as CherryMessagePart;
    const declined = {
      approval: { approved: false, id: 'a3', reason: 'user said no' },
      state: 'approval-responded',
      type: 'dynamic-tool',
    } as unknown as CherryMessagePart;

    const parts = finalizeTurnToolApprovals(
      [textPart, requested('a1'), approved, declined],
      'aborted',
    );

    expect(parts[0]).toBe(textPart);
    // Waiting on the user, and never answered: denied so the call gets a result.
    expect(parts[1]).toMatchObject({
      approval: { approved: false, id: 'a1', reason: 'aborted' },
      state: 'output-denied',
    });
    // Approved but the tool never reported back — the result is lost, not denied.
    expect(parts[2]).toMatchObject({
      approval: { approved: true, id: 'a2' },
      errorText: 'aborted',
      state: 'output-error',
    });
    // An explicit denial reason outranks the turn-level one.
    expect(parts[3]).toMatchObject({
      approval: { approved: false, id: 'a3', reason: 'user said no' },
      state: 'output-denied',
    });

    // The terminal state and reason above are addressed to the model; this
    // flag is what tells `McpToolPart` the decision was the app's, so it says
    // "Unfinished" instead of reporting a denial the user never made.
    expect(toolMetaOf(parts[1])?.settledByApp).toBe(true);
    expect(toolMetaOf(parts[2])?.settledByApp).toBe(true);
    // The user did decline this one, so it stays their decision and the UI is
    // free to show it as such — stamping it here would misattribute it.
    expect(toolMetaOf(parts[3])?.settledByApp).toBeUndefined();
  });

  test('getPendingToolApprovals reads the assistant tip regardless of persisted status', () => {
    const waiting = {
      ...createMessage('assistant-1', 'assistant'),
      data: { parts: [requested('a1'), requested('a2', 'create')] },
      status: 'success' as const,
    };

    expect(getPendingToolApprovals([createMessage('user-1', 'user'), waiting])).toEqual([
      expect.objectContaining({ approvalId: 'a1', messageId: 'assistant-1', toolName: 'search' }),
      expect.objectContaining({ approvalId: 'a2', toolName: 'create' }),
    ]);
    expect(getPendingToolApprovals([{ ...waiting, status: 'paused' }])).toHaveLength(2);
    expect(getPendingToolApprovals([{ ...waiting, status: 'pending' }])).toHaveLength(2);
    // Only the active tip counts: an older approval request is not actionable.
    expect(getPendingToolApprovals([waiting, createMessage('user-2', 'user')])).toEqual([]);
  });

  test('getPendingToolApprovals carries built-in identity from tool metadata', () => {
    const builtin = {
      ...requested('a1', 'builtin_get_current_location'),
      toolMetadata: { cherry: { tool: { type: 'builtin' } } },
    } as CherryMessagePart;
    const waiting = {
      ...createMessage('assistant-1', 'assistant'),
      data: { parts: [builtin] },
    };

    expect(getPendingToolApprovals([waiting])).toEqual([
      expect.objectContaining({
        toolName: 'builtin_get_current_location',
        toolType: 'builtin',
      }),
    ]);
  });

  test('mergeMessageStats adds what a resumed segment spends', () => {
    expect(mergeMessageStats(undefined, { totalTokens: 5 })).toEqual({ totalTokens: 5 });
    expect(mergeMessageStats({ totalTokens: 5 }, undefined)).toEqual({ totalTokens: 5 });
    expect(
      mergeMessageStats(
        { completionTokens: 10, timeCompletionMs: 900, totalTokens: 30 },
        { completionTokens: 7, timeCompletionMs: 400, totalTokens: 12 },
      ),
    ).toEqual({ completionTokens: 17, timeCompletionMs: 1300, totalTokens: 42 });
  });

  test('mergeMessageStats keeps the first segment time to first token', () => {
    expect(mergeMessageStats({ timeFirstTokenMs: 100 }, { timeFirstTokenMs: 40 })).toEqual({
      timeFirstTokenMs: 100,
    });
    // The first segment died before its first token: the resumed one owns it.
    expect(mergeMessageStats({ totalTokens: 1 }, { timeFirstTokenMs: 40 })).toEqual({
      timeFirstTokenMs: 40,
      totalTokens: 1,
    });
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
