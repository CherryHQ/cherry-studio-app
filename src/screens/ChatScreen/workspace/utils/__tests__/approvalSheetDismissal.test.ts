import { controlledCloseReason } from '@/components/bottomSheet/hooks/useBottomSheet';
import { nextDismissedApprovalMessageId } from '../approvalSheetDismissal';

describe('nextDismissedApprovalMessageId', () => {
  test('records the message a user dismissal was aimed at', () => {
    expect(
      nextDismissedApprovalMessageId({
        approvalMessageId: 'assistant-1',
        previous: null,
        reason: 'dismiss',
      }),
    ).toBe('assistant-1');
  });

  test('leaves the dismissal untouched when the sheet closes from code', () => {
    // Answering the last approval closes the sheet itself. Recording that as a
    // dismissal would suppress every later approval on the same message —
    // resumed segments keep the id.
    expect(
      nextDismissedApprovalMessageId({
        approvalMessageId: 'assistant-1',
        previous: null,
        reason: controlledCloseReason,
      }),
    ).toBeNull();
    expect(
      nextDismissedApprovalMessageId({
        approvalMessageId: undefined,
        previous: 'assistant-0',
        reason: controlledCloseReason,
      }),
    ).toBe('assistant-0');
  });

  test('clears the dismissal when there is no approval left to shut out', () => {
    expect(
      nextDismissedApprovalMessageId({
        approvalMessageId: undefined,
        previous: 'assistant-0',
        reason: 'dismiss',
      }),
    ).toBeNull();
  });
});
