import { getComposerBottomPadding } from '@cherrystudio/ui/components';

/** Clearance beyond the padding already owned by the dock. */
export function getComposerExtraBottomOffset(bottomInset: number, dockClearance: number) {
  return dockClearance > 0
    ? Math.max(0, bottomInset + dockClearance - getComposerBottomPadding(bottomInset))
    : 0;
}
