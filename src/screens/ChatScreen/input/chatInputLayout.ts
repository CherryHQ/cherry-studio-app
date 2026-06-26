export const chatInputMinTextAreaHeight = 44;
export const chatInputMaxTextAreaHeight = 132;
export const chatInputBottomToolbarHeight = 44;
export const chatInputMinComposerHeight = chatInputMinTextAreaHeight + chatInputBottomToolbarHeight;
export const chatInputMinBottomPadding = 8;
// At rest the composer shows the full surface (toolbar + text area + actions),
// just this many px narrower than the focused full width (centered, so the inset
// is split across both sides). Focusing springs it out to full width — the
// grow-on-focus motion without the old collapsed pill.
export const chatInputRestingWidthDelta = 28;
// Floor so the surface never shrinks below this on very narrow screens.
export const chatInputMinSurfaceWidth = 220;
export const chatInputHorizontalScreenInset = 16;
export const chatInputMessageListGap = 8;

export function getChatInputMinimumHeight(bottomInset: number) {
  return chatInputMinComposerHeight + Math.max(bottomInset, chatInputMinBottomPadding);
}
