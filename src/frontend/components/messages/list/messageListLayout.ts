import { resolveUserMessageContentAnchorMaxSize } from '../rows/userMessageLayout';
import type { MessageListItem } from '../types';

// 被锚定的用户消息距内容区顶部（顶部安全区/导航栏之下）的视觉间距。
export const ANCHOR_TOP_GAP = 12;
export const MESSAGE_ROW_HORIZONTAL_PADDING = 16;
export const MESSAGE_ROW_VERTICAL_PADDING = {
  assistant: 12,
  user: 8,
} as const satisfies Record<MessageListItem['role'], number>;

export function resolveUserMessageAnchorMaxSize(bodyLineHeight: number) {
  return (
    resolveUserMessageContentAnchorMaxSize(bodyLineHeight) + MESSAGE_ROW_VERTICAL_PADDING.user * 2
  );
}

// 流式助手消息高度持续变化，不能成为 MVCP 的锚点，否则它会把已钉顶的用户消息向下推。
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

export function getAnchoredUserMessageIndex(messages: readonly MessageListItem[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      return index;
    }
  }

  return -1;
}
