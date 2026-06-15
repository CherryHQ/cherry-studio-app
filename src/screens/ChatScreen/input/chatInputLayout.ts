export const chatInputMinTextAreaHeight = 52;
export const chatInputMaxTextAreaHeight = 132;
export const chatInputBottomToolbarHeight = 44;
export const chatInputMinComposerHeight = chatInputMinTextAreaHeight + chatInputBottomToolbarHeight;
export const chatInputMinBottomPadding = 8;
// 44 = button(32) + 2 * bottom-1.5(6); keeps the collapsed placeholder text
// (pt-3 + half line-height ≈ y22) aligned with the send button's vertical center.
export const chatInputCollapsedHeight = 44;
// Collapsed pill spans this fraction of the available width (floored at the px
// minimum for very narrow screens), then animates out to full width on expand.
export const chatInputCollapsedWidthRatio = 0.8;
export const chatInputCollapsedWidth = 220;
export const chatInputHorizontalScreenInset = 16;
export const chatInputMessageListGap = 8;

export function getChatInputMinimumHeight(bottomInset: number) {
  return chatInputMinComposerHeight + Math.max(bottomInset, chatInputMinBottomPadding);
}
