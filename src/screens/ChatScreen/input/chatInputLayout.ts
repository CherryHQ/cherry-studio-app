export const chatInputMinTextAreaHeight = 44;
export const chatInputMaxTextAreaHeight = 132;
export const chatInputControlGap = 8;
export const chatInputMergedAddButtonSlotWidth = 36;
export const chatInputMinBottomPadding = 8;
export const chatInputHorizontalScreenInset = 12;
export const chatInputMessageListGap = 8;

export function getChatInputMinimumHeight(bottomInset: number) {
  return chatInputMinTextAreaHeight + Math.max(bottomInset, chatInputMinBottomPadding);
}
