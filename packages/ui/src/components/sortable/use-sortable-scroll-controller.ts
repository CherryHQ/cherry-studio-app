import { useMemo, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import type { SortableScrollController } from './sortable.types';

export type SortableScrollableTarget = {
  scrollTo?: (options: { animated?: boolean; x?: number; y?: number }) => void;
  scrollToOffset?: (options: { animated?: boolean; offset: number }) => void;
};

/** Tracks scroll offset and exposes a `SortableScrollController` for edge auto-scroll. */
export function useSortableScrollController<
  T extends SortableScrollableTarget = SortableScrollableTarget,
>() {
  const [state] = useState<{ offset: number; target: T | null }>(() => ({
    offset: 0,
    target: null,
  }));

  return useMemo(() => {
    const controller: SortableScrollController = {
      getOffset: () => state.offset,
      scrollTo: (offset, animated = false) => {
        if (state.target?.scrollToOffset) {
          state.target.scrollToOffset({ animated, offset });
          return;
        }
        state.target?.scrollTo?.({ animated, y: offset });
      },
    };

    return {
      controller,
      onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        state.offset = event.nativeEvent.contentOffset.y;
      },
      setRef: (node: T | null) => {
        state.target = node;
      },
    };
  }, [state]);
}
