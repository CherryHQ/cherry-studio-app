import type { MessagePresentationItem } from '../types';

// 被锚定的用户消息距内容区顶部（顶部安全区/导航栏之下）的视觉间距。
export const ANCHOR_TOP_GAP = 12;
export const ANCHOR_MAX_TEXT_LINES = 2;
export const USER_MESSAGE_VERTICAL_PADDING = 32;

// 流式助手消息高度持续变化，不能成为 MVCP 的锚点，否则它会把已钉顶的用户消息向下推。
function shouldRestoreMessagePosition(item: MessagePresentationItem): boolean {
  return !(item.role === 'assistant' && item.status === 'pending');
}

export const MAINTAIN_VISIBLE_CONTENT_POSITION = {
  data: true,
  shouldRestorePosition: shouldRestoreMessagePosition,
};

export function messageKeyExtractor(item: MessagePresentationItem) {
  return item.id;
}

// LegendList 按角色维护真实尺寸均值；空助手行单独分类，避免用长回复均值估算 loading 行。
export function getMessageRowType(item: MessagePresentationItem) {
  if (item.role !== 'assistant') {
    return item.role;
  }

  return item.data.parts?.length ? 'assistant' : 'assistant-empty';
}

export function getAnchoredUserMessageIndex(messages: readonly MessagePresentationItem[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      return index;
    }
  }

  return -1;
}
