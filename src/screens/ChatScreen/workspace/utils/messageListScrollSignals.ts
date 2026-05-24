import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { messageWindowPolicy } from '@/hooks/chat/utils/messageWindowPolicy';

export type MessageListScrollSignal = {
  isNearStart: boolean;
};

export function getMessageListScrollSignal(
  event: NativeSyntheticEvent<NativeScrollEvent>,
): MessageListScrollSignal {
  const { contentOffset, layoutMeasurement } = event.nativeEvent;
  const nearStartThreshold =
    layoutMeasurement.height * messageWindowPolicy.olderPrefetchStartThreshold;

  return {
    isNearStart: contentOffset.y <= nearStartThreshold,
  };
}
