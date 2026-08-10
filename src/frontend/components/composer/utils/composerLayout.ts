// What the message list reserves for the input before it has measured one: a
// single-line field plus the toolbar row under it, at the composer's own sizes.
const composerTextRowHeight = 44;
const composerToolbarRowHeight = 44;
export const composerMinHeight = composerTextRowHeight + composerToolbarRowHeight;
export const composerMinBottomPadding = 8;
export const composerHorizontalScreenInset = 16;
export const composerContentGap = 8;

export function getComposerMinimumHeight(bottomInset: number) {
  return composerMinHeight + Math.max(bottomInset, composerMinBottomPadding);
}

// KeyboardStickyView offset shared by the floating input and anything that
// must ride along with it (e.g. the reasoning panel): with the keyboard open
// the safe-area bottom padding is no longer needed, keep only the minimum.
export function getComposerKeyboardStickyOffset(bottomInset: number) {
  return Math.max(bottomInset - composerMinBottomPadding, 0);
}
