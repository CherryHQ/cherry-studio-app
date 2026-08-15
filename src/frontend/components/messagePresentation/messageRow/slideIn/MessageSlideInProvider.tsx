import { createContext, type ReactNode, use } from 'react';

import type { MessageSlideInFlight } from './hooks/useMessageSlideInFlight';

// 没有 Provider 包裹时（例如行被单独渲染）降级为无动画：行读不到飞行就恒在落点。
const MessageSlideInFlightContext = createContext<MessageSlideInFlight | undefined>(undefined);

type MessageSlideInProviderProps = {
  children: ReactNode;
  // 飞行由列表持有而不是由本 Provider 自己起：起飞距离是**钉顶几何**（视口高、上下 inset、
  // 落点偏移），这些量属于列表；而开火时机是钉顶落位那一帧，也只有列表知道。Provider 只负责
  // 把它送到 renderItem 深处的行，那里没法走 props。
  flight: MessageSlideInFlight;
};

export function MessageSlideInProvider({ children, flight }: MessageSlideInProviderProps) {
  return <MessageSlideInFlightContext value={flight}>{children}</MessageSlideInFlightContext>;
}

export function useMessageSlideInFlightContext(): MessageSlideInFlight | undefined {
  return use(MessageSlideInFlightContext);
}
