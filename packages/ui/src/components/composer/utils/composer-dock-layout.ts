const composerTextRowHeight = 44;
const composerToolbarRowHeight = 44;
const composerMinHeight = composerTextRowHeight + composerToolbarRowHeight;
const composerBottomLift = 4;

const composerMinBottomPadding = 8;
export const composerHorizontalScreenInset = 16;
export const composerContentGap = 8;

export function getComposerBottomPadding(bottomInset: number) {
  return Math.max(bottomInset, composerMinBottomPadding) + composerBottomLift;
}

export function getComposerMinimumHeight(bottomInset: number) {
  return composerMinHeight + getComposerBottomPadding(bottomInset);
}

export function getComposerKeyboardStickyOffset(bottomInset: number) {
  return Math.max(bottomInset - composerMinBottomPadding, 0);
}
