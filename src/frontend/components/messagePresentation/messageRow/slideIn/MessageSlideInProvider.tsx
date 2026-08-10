import { createContext, type ReactNode, useContext, useMemo, useRef, useState } from 'react';

import { createSlideInGate } from './slideInGate';

type MessageSlideInContextValue = {
  // 在用户气泡 mount 时调用一次，返回该气泡是否应播 slide-in。
  claim: (messageId: string) => boolean;
};

// 默认不播：没有 Provider 包裹时（例如被单独渲染的场景）安全降级为无动画。
const MessageSlideInContext = createContext<MessageSlideInContextValue>({
  claim: () => false,
});

type MessageSlideInProviderProps = {
  // 当前「刚发送、应播入场动画」的用户消息 id（取 pendingUserMessage.id）；
  // 无正在发送的消息时为 undefined。
  slideInMessageId: string | undefined;
  children: ReactNode;
};

export function MessageSlideInProvider({
  slideInMessageId,
  children,
}: MessageSlideInProviderProps) {
  // gate 的 played 记录跨 render 持久（每个会话一份），保证每条消息一生只播一次。
  const gateRef = useRef(createSlideInGate());
  const value = useMemo<MessageSlideInContextValue>(
    () => ({ claim: (messageId) => gateRef.current.claim(messageId, slideInMessageId) }),
    [slideInMessageId],
  );

  return <MessageSlideInContext.Provider value={value}>{children}</MessageSlideInContext.Provider>;
}

/**
 * 在用户气泡 mount 时消费一次授权：仅当自己是当前发送目标且未播过时返回 true。
 * 用 useState 初始化器确保只在 mount 那一帧求值（与 reanimated entering 的一次性语义对齐），
 * 后续 re-render 不会改变结果。
 */
export function useShouldSlideIn(messageId: string): boolean {
  const { claim } = useContext(MessageSlideInContext);
  const [shouldSlideIn] = useState(() => claim(messageId));

  return shouldSlideIn;
}
