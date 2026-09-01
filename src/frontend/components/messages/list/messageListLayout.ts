import type { MessageListItem } from '../types';

export const MESSAGE_LIST_TOP_PADDING = 12;
export const MESSAGE_ROW_HORIZONTAL_PADDING = 16;
export const MESSAGE_ROW_VERTICAL_PADDING = {
  assistant: 12,
  user: 8,
} as const satisfies Record<MessageListItem['role'], number>;

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
  if (item.role !== 'assistant') {
    return item.role;
  }

  return item.data.parts?.length ? 'assistant' : 'assistant-empty';
}
