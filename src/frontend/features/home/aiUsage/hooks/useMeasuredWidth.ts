import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';

export function useMeasuredWidth(enabled = true) {
  const ref = useRef<View>(null);
  const [width, setWidth] = useState(0);

  const updateWidth = useCallback((nextWidth: number) => {
    const roundedWidth = Math.round(nextWidth);
    setWidth((currentWidth) => (currentWidth === roundedWidth ? currentWidth : roundedWidth));
  }, []);

  useLayoutEffect(() => {
    const element = ref.current;
    if (enabled && typeof element?.getBoundingClientRect === 'function') {
      updateWidth(element.getBoundingClientRect().width);
    }
  }, [enabled, updateWidth]);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (enabled) {
        updateWidth(event.nativeEvent.layout.width);
      }
    },
    [enabled, updateWidth],
  );

  return { onLayout, ref, width };
}
