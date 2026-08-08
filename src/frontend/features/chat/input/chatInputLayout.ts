// What the message list reserves for the input before it has measured one: a
// single-line field plus the toolbar row under it, at the composer's own sizes.
const chatInputTextRowHeight = 44;
const chatInputToolbarRowHeight = 44;
export const chatInputMinComposerHeight = chatInputTextRowHeight + chatInputToolbarRowHeight;
export const chatInputMinBottomPadding = 8;
export const chatInputHorizontalScreenInset = 16;
export const chatInputMessageListGap = 8;

export function getChatInputMinimumHeight(bottomInset: number) {
  return chatInputMinComposerHeight + Math.max(bottomInset, chatInputMinBottomPadding);
}

// KeyboardStickyView offset shared by the floating input and anything that
// must ride along with it (e.g. the reasoning panel): with the keyboard open
// the safe-area bottom padding is no longer needed, keep only the minimum.
export function getChatInputKeyboardStickyOffset(bottomInset: number) {
  return Math.max(bottomInset - chatInputMinBottomPadding, 0);
}
