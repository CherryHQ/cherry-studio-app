const composerTextRowHeight = 44;
const composerToolbarRowHeight = 44;
const composerMinHeight = composerTextRowHeight + composerToolbarRowHeight;

export const composerMinBottomPadding = 8;
export const composerHorizontalScreenInset = 16;
export const composerContentGap = 8;

export function getComposerMinimumHeight(bottomInset: number) {
  return composerMinHeight + Math.max(bottomInset, composerMinBottomPadding);
}

export function getComposerKeyboardStickyOffset(bottomInset: number) {
  return Math.max(bottomInset - composerMinBottomPadding, 0);
}
