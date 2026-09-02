import type { ChatScrollAnchor } from '@/shared/data/cache/cacheSchemas';

export type MessageListRestoreTarget = Readonly<{
  align: 'end' | 'start';
  index: number;
  offset: number;
}>;

type ComputeScrollAnchorOptions = {
  getKeyAtIndex: (index: number) => null | string;
  getOffsetAtIndex: (index: number) => number;
  scrollOffset: number;
  topIndex: number;
};

/**
 * Derives the semantic item anchor stored while the user is reading history.
 * Following the live edge stores no anchor at all, so that case never reaches here.
 */
export function computeScrollAnchor({
  getKeyAtIndex,
  getOffsetAtIndex,
  scrollOffset,
  topIndex,
}: ComputeScrollAnchorOptions): ChatScrollAnchor {
  const key = getKeyAtIndex(topIndex);
  if (!key) {
    return null;
  }

  return {
    key,
    offset: Math.max(0, scrollOffset - getOffsetAtIndex(topIndex)),
  };
}

/** Resolves a saved semantic anchor into one LegendList scroll target. */
export function resolveRestoreTarget(
  saved: ChatScrollAnchor | undefined,
  findIndexByKey: (key: string) => number,
  lastIndex: number,
): MessageListRestoreTarget {
  if (saved) {
    const index = findIndexByKey(saved.key);
    if (index >= 0) {
      return { align: 'start', index, offset: saved.offset };
    }
  }

  return { align: 'end', index: lastIndex, offset: 0 };
}
