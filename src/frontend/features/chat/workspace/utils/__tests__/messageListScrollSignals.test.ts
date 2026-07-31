import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { getMessageListScrollSignal } from '../messageListScrollSignals';

function createScrollEvent(offsetY: number, height = 1000) {
  return {
    nativeEvent: {
      contentOffset: { y: offsetY },
      layoutMeasurement: { height },
    },
  } as NativeSyntheticEvent<NativeScrollEvent>;
}

describe('getMessageListScrollSignal', () => {
  test('marks the list near start within the prefetch threshold', () => {
    expect(getMessageListScrollSignal(createScrollEvent(850)).isNearStart).toBe(true);
  });

  test('marks the list away from start beyond the prefetch threshold', () => {
    expect(getMessageListScrollSignal(createScrollEvent(851)).isNearStart).toBe(false);
  });
});
