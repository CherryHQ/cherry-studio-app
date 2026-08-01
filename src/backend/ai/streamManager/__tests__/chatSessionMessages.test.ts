import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';
import { readCherryMeta } from '@cherrystudio/universal/data/types/uiParts';

import {
  dropEmptyContentParts,
  finalizeInterruptedParts,
  finalizeTurnToolApprovals,
  hasPendingToolApproval,
} from '../chatSessionMessages';

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
});

describe('dropEmptyContentParts', () => {
  test('drops blank text and reasoning parts, keeping everything else', () => {
    const kept: CherryMessagePart[] = [
      { text: 'hello', type: 'text' },
      { state: 'done', text: 'thought', type: 'reasoning' },
      { state: 'output-available', type: 'dynamic-tool' } as unknown as CherryMessagePart,
    ];

    expect(
      dropEmptyContentParts([
        kept[0],
        { text: '', type: 'text' },
        { text: '   \n', type: 'text' },
        kept[1],
        { state: 'done', text: '  ', type: 'reasoning' },
        kept[2],
      ]),
    ).toEqual(kept);
  });

  test('returns the same array when nothing is dropped', () => {
    const parts: CherryMessagePart[] = [{ text: 'hello', type: 'text' }];
    expect(dropEmptyContentParts(parts)).toBe(parts);
  });
});

describe('finalizeInterruptedParts', () => {
  const streamingReasoning = (meta?: Record<string, unknown>): CherryMessagePart =>
    ({
      ...(meta ? { providerMetadata: { cherry: meta } } : {}),
      state: 'streaming',
      text: 'thinking',
      type: 'reasoning',
    }) as unknown as CherryMessagePart;
  const toolPart = (state: string, extra: Record<string, unknown> = {}): CherryMessagePart =>
    ({
      state,
      toolCallId: 'call-1',
      toolName: 'search',
      type: 'dynamic-tool',
      ...extra,
    }) as unknown as CherryMessagePart;
  const toolMetaOf = (part: CherryMessagePart) =>
    readCherryMeta(part as Extract<CherryMessagePart, { type: 'dynamic-tool' }>);

  test('is the identity on success so an awaiting-approval turn survives', () => {
    const parts = [streamingReasoning(), toolPart('approval-requested')];
    expect(finalizeInterruptedParts(parts, 'success')).toBe(parts);
  });

  test.each([
    { expected: 'Interrupted by user', status: 'paused' as const },
    { expected: 'Stream errored before tool completed', status: 'error' as const },
  ])('terminalizes a dangling tool part on $status', ({ expected, status }) => {
    // Left at input-available, the model's tool call has no result, and the
    // provider rejects the whole branch on the next request.
    expect(finalizeInterruptedParts([toolPart('input-available')], status)[0]).toMatchObject({
      errorText: expected,
      state: 'output-error',
    });
  });

  test.each(['output-available', 'output-error', 'output-denied'])(
    'leaves an already-terminal %s tool part alone',
    (state) => {
      const parts = [toolPart(state, { errorText: 'original' })];
      expect(finalizeInterruptedParts(parts, 'error')[0]).toBe(parts[0]);
    },
  );

  test('does not overwrite an approval settled by finalizeTurnToolApprovals', () => {
    // Ordering guarantee: callers settle approvals first, and the richer
    // output-denied + settledByApp outcome has to survive the generic pass.
    const settled = finalizeTurnToolApprovals(
      [toolPart('approval-requested', { approval: { id: 'a1' } })],
      'aborted',
    );

    const finalized = finalizeInterruptedParts(settled, 'paused');

    expect(finalized[0]).toMatchObject({ state: 'output-denied' });
    expect(toolMetaOf(finalized[0])?.settledByApp).toBe(true);
  });

  test('closes a streaming reasoning part and backfills thinkingMs', () => {
    jest.spyOn(Date, 'now').mockReturnValue(5_000);

    const [finalized] = finalizeInterruptedParts(
      [streamingReasoning({ startedAt: 3_000 })],
      'error',
    );

    expect(finalized).toMatchObject({ state: 'done' });
    expect(
      readCherryMeta(finalized as Extract<CherryMessagePart, { type: 'reasoning' }>)?.thinkingMs,
    ).toBe(2_000);

    jest.restoreAllMocks();
  });

  test('keeps an existing thinkingMs and a reasoning part already done', () => {
    const done = { state: 'done', text: 'thought', type: 'reasoning' } as CherryMessagePart;
    const [finalizedStreaming, finalizedDone] = finalizeInterruptedParts(
      [streamingReasoning({ startedAt: 1, thinkingMs: 42 }), done],
      'paused',
    );

    expect(
      readCherryMeta(finalizedStreaming as Extract<CherryMessagePart, { type: 'reasoning' }>)
        ?.thinkingMs,
    ).toBe(42);
    expect(finalizedDone).toBe(done);
  });
});
