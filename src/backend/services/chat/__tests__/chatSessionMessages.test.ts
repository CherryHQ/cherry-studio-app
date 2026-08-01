import type { CherryMessagePart } from '@cherrystudio/shared/data/types/message';
import { readCherryMeta } from '@cherrystudio/shared/data/types/uiParts';

import { finalizeTurnToolApprovals, hasPendingToolApproval } from '../chatSessionMessages';

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
