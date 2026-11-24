import type { InfiniteData } from '@tanstack/react-query';

import type { OrderRequest } from '@/shared/data/api/schemas/endpointHelpers';
import type { CursorPaginationResponse } from '@/shared/data/api/types';

export interface OrderMove {
  anchor: OrderRequest;
  id: string;
}

export { reorderLocally } from '@/shared/utils/reorder';

/**
 * Compute minimal sequential anchor moves to transform `oldItems` into `newItems`.
 * Always anchors relative to kept/already-placed items in the same slice so
 * subgroup reorders never jump past pinned items or adjacent groups.
 */
export function computeMinimalMoves<T>(
  oldItems: readonly T[],
  newItems: readonly T[],
  getId: (item: T) => string,
): OrderMove[] {
  if (oldItems.length !== newItems.length) {
    throw new Error(
      `computeMinimalMoves: newItems length (${newItems.length}) must equal oldItems length (${oldItems.length})`,
    );
  }
  if (oldItems.length <= 1) {
    return [];
  }

  const oldIndexById = new Map<string, number>();
  for (let index = 0; index < oldItems.length; index++) {
    const id = requireNonEmptyId(getId(oldItems[index]), 'oldItems');
    if (oldIndexById.has(id)) {
      throw new Error(`computeMinimalMoves: duplicate id "${id}" in oldItems`);
    }
    oldIndexById.set(id, index);
  }

  const newIds: string[] = [];
  const permutation: number[] = [];
  let isIdentity = true;

  for (let index = 0; index < newItems.length; index++) {
    const id = requireNonEmptyId(getId(newItems[index]), 'newItems');
    const oldIndex = oldIndexById.get(id);
    if (oldIndex === undefined) {
      throw new Error(`computeMinimalMoves: newItems id "${id}" is absent from oldItems`);
    }
    if (oldIndex !== index) {
      isIdentity = false;
    }
    newIds.push(id);
    permutation.push(oldIndex);
  }

  if (new Set(permutation).size !== permutation.length) {
    throw new Error('computeMinimalMoves: duplicate ids in newItems');
  }
  if (isIdentity) {
    return [];
  }

  const lisIndexSet = longestIncreasingSubsequenceIndices(permutation);
  let firstLisIndex = newIds.length;
  for (const lisIndex of lisIndexSet) {
    if (lisIndex < firstLisIndex) {
      firstLisIndex = lisIndex;
    }
  }

  const moves: OrderMove[] = [];
  for (let index = 0; index < newIds.length; index++) {
    if (lisIndexSet.has(index)) {
      continue;
    }

    const id = newIds[index];
    if (index === 0) {
      moves.push({ anchor: { before: newIds[firstLisIndex] }, id });
    } else {
      moves.push({ anchor: { after: newIds[index - 1] }, id });
    }
  }

  return moves;
}

/**
 * Reorder only the slots currently occupied by `orderedIds` inside `list`,
 * preserving non-matching items (such as pinned items or other groups) in place.
 */
export function applySublistOrderToList<T>(
  list: readonly T[],
  orderedIds: readonly string[],
  getId: (item: T) => string,
): T[] {
  if (list.length === 0 || orderedIds.length <= 1) {
    return [...list];
  }

  const orderedSet = new Set(orderedIds);
  const itemsById = new Map<string, T>();
  for (const item of list) {
    const id = getId(item);
    if (orderedSet.has(id)) {
      itemsById.set(id, item);
    }
  }

  if (itemsById.size <= 1) {
    return [...list];
  }

  const queue: T[] = [];
  for (const id of orderedIds) {
    const matched = itemsById.get(id);
    if (matched !== undefined) {
      queue.push(matched);
    }
  }

  let cursor = 0;
  let changed = false;
  const next = list.map((item) => {
    if (!orderedSet.has(getId(item)) || cursor >= queue.length) {
      return item;
    }
    const replacement = queue[cursor];
    cursor += 1;
    if (replacement !== item) {
      changed = true;
    }
    return replacement;
  });

  return changed ? next : [...list];
}

/**
 * Apply `orderedIds` onto any supported TanStack Query cache payload:
 * flat array, wrapped `{ items }` page object, or cursor `InfiniteData`.
 */
export function applySublistOrderToCacheData<T>(
  data: unknown,
  orderedIds: readonly string[],
  getId: (item: T) => string,
): unknown {
  if (data === undefined || data === null) {
    return data;
  }

  if (Array.isArray(data)) {
    return applySublistOrderToList(data as readonly T[], orderedIds, getId);
  }

  if (typeof data === 'object' && 'pages' in data) {
    const infinite = data as InfiniteData<CursorPaginationResponse<T>, unknown>;
    if (!Array.isArray(infinite.pages)) {
      return data;
    }

    const flattened = infinite.pages.flatMap((page) => page.items);
    const reordered = applySublistOrderToList(flattened, orderedIds, getId);
    let offset = 0;
    const pages = infinite.pages.map((page) => {
      const items = reordered.slice(offset, offset + page.items.length);
      offset += page.items.length;
      return { ...page, items };
    });
    return { ...infinite, pages };
  }

  if (typeof data === 'object' && 'items' in data) {
    const paginated = data as { items: unknown };
    if (!Array.isArray(paginated.items)) {
      return data;
    }
    return {
      ...paginated,
      items: applySublistOrderToList(paginated.items as readonly T[], orderedIds, getId),
    };
  }

  return data;
}

function requireNonEmptyId(id: string, source: string): string {
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`computeMinimalMoves: expected non-empty id in ${source}`);
  }
  return id;
}

function longestIncreasingSubsequenceIndices(values: readonly number[]): Set<number> {
  const length = values.length;
  if (length === 0) {
    return new Set();
  }

  const tailIndices: number[] = [];
  const prev = new Array<number>(length).fill(-1);

  for (let index = 0; index < length; index++) {
    const value = values[index];
    let lo = 0;
    let hi = tailIndices.length;

    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (values[tailIndices[mid]] < value) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    if (lo > 0) {
      prev[index] = tailIndices[lo - 1];
    }
    if (lo === tailIndices.length) {
      tailIndices.push(index);
    } else {
      tailIndices[lo] = index;
    }
  }

  const indices = new Set<number>();
  let cursor = tailIndices[tailIndices.length - 1];
  while (cursor !== -1) {
    indices.add(cursor);
    cursor = prev[cursor];
  }
  return indices;
}
