import type { ReactElement } from 'react';
import type { GestureResponderEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

type ScrollEventHandler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
type TouchEventHandler = (event: GestureResponderEvent) => void;

export type ScrollInteractionHandlers = {
  onMomentumScrollBegin?: ScrollEventHandler;
  onMomentumScrollEnd?: ScrollEventHandler;
  onScrollBeginDrag?: ScrollEventHandler;
  onScrollEndDrag?: ScrollEventHandler;
  onTouchCancel?: TouchEventHandler;
  onTouchEnd?: TouchEventHandler;
  onTouchStart?: TouchEventHandler;
};

export type ScrollInteractionBoundaryProps = ScrollInteractionHandlers & {
  children: (handlers: ScrollInteractionHandlers) => ReactElement;
};
