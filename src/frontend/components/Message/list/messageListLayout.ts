import type { MessageListItem } from '../types';

export const MESSAGE_LIST_TOP_PADDING = 12;
export const MESSAGE_ROW_HORIZONTAL_PADDING = 16;
export const MESSAGE_ROW_VERTICAL_PADDING = {
  assistant: 12,
  system: 0,
  user: 8,
} as const satisfies Record<MessageListItem['role'], number>;

/** Content height includes the current keyboard inset. */
export function isMessageListAtBottom(
  scrollOffset: number,
  contentHeight: number,
  viewportHeight: number,
): boolean {
  'worklet';
  return Math.max(0, contentHeight - viewportHeight) - scrollOffset <= 1;
}

// Distance past the bottom inset within which the growing end counts as on screen.
// Revealing early hides the catch-up render; hiding later avoids flapping at the edge.
const LIVE_TAIL_REVEAL_MARGIN = 160;
const LIVE_TAIL_HIDE_MARGIN = 320;

/** Whether the list's growing end is on screen or close enough to reveal. */
export function isMessageListLiveTailInView(
  scrollOffset: number,
  contentHeight: number,
  viewportHeight: number,
  bottomInset: number,
  wasInView: boolean,
): boolean {
  'worklet';
  const distanceFromEnd = contentHeight - viewportHeight - scrollOffset;
  const margin = wasInView ? LIVE_TAIL_HIDE_MARGIN : LIVE_TAIL_REVEAL_MARGIN;
  return distanceFromEnd <= bottomInset + margin;
}

// 流式助手消息高度持续变化，不能成为 MVCP 的数据恢复锚点。
function shouldRestoreMessagePosition(item: MessageListItem): boolean {
  return !(item.role === 'assistant' && item.status === 'pending');
}

export const MAINTAIN_VISIBLE_CONTENT_POSITION = {
  data: true,
  shouldRestorePosition: shouldRestoreMessagePosition,
};

export function messageKeyExtractor(item: MessageListItem) {
  return item.id;
}

// LegendList 按角色维护真实尺寸均值；空助手行单独分类，避免用长回复均值估算 loading 行。
export function getMessageRowType(item: MessageListItem) {
  if (item.role === 'system') {
    return 'system';
  }
  if (item.role !== 'assistant') {
    return item.role;
  }

  return item.data.parts?.length ? 'assistant' : 'assistant-empty';
}
