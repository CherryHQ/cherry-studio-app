import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

import {
  finalizeTurnToolApprovals,
  hasPendingToolApproval,
  mergeMessageStats,
  statsFromMetadata,
} from '../chatSessionMessages';

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
