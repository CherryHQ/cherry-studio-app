// Straight from the hook rather than the barrel: the barrel also pulls in the
// sheet component, and this module is pure.
import {
  type BottomSheetCloseReason,
  controlledCloseReason,
} from '@/components/bottomSheet/hooks/useBottomSheet';

/**
 * Which message the approval sheet stays shut for. Only a close the *user*
 * performed counts: answering the last approval closes the sheet from code, and
 * the message id is the same across resumed segments — recording that one would
 * suppress every later approval on the same message.
 */
export function nextDismissedApprovalMessageId(input: {
  approvalMessageId: string | undefined;
  previous: string | null;
  reason: BottomSheetCloseReason;
}): string | null {
  if (input.reason === controlledCloseReason) {
    return input.previous;
  }

  return input.approvalMessageId ?? null;
}
