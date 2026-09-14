import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/** Measures the receiving container, including when it occupies only part of a window. */
export function useLayoutWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth > 0) setWidth(nextWidth);
  }, []);

  return { onLayout, width };
}
