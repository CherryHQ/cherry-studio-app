import type { InfiniteData } from '@tanstack/react-query';

import type { CursorPaginationResponse } from '@/shared/data/api/types';

import {
  applySublistOrderToCacheData,
  applySublistOrderToList,
  computeMinimalMoves,
  type OrderMove,
  reorderLocally,
} from '../reorder';

type Item = { id: string; pinned?: boolean };

function applyMovesLocally(items: readonly Item[], moves: readonly OrderMove[]): Item[] {
  const next = [...items];
  for (const move of moves) {
    const fromIndex = next.findIndex((item) => item.id === move.id);
    const [target] = next.splice(fromIndex, 1);
    const anchor = move.anchor;
    if ('position' in anchor) {
      next.splice(anchor.position === 'first' ? 0 : next.length, 0, target);
    } else if ('before' in anchor) {
      const idx = next.findIndex((item) => item.id === anchor.before);
      next.splice(idx, 0, target);
    } else {
      const idx = next.findIndex((item) => item.id === anchor.after);
      next.splice(idx + 1, 0, target);
    }
  }
  return next;
}

describe('reorder utilities', () => {
  const items: Item[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  test('reorderLocally moves an element without mutating input and ignores invalid indices', () => {
    const moved = reorderLocally(items, 2, 0);
    expect(moved.map((item) => item.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(items.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(reorderLocally(items, 1, 1)).toEqual(items);
    expect(reorderLocally(items, -1, 2)).toEqual(items);
    expect(reorderLocally(items, 1, 99)).toEqual(items);
  });

  test('computeMinimalMoves uses relative neighbor anchors for move-to-top, move-to-bottom, and arbitrary permutations', () => {
    expect(computeMinimalMoves(items, items, (item) => item.id)).toEqual([]);
    expect(computeMinimalMoves([], [], (item: Item) => item.id)).toEqual([]);
    expect(computeMinimalMoves([{ id: 'only' }], [{ id: 'only' }], (item) => item.id)).toEqual([]);

    // Move last item to first -> relative { before: 'a' } so subgroups never escape their boundary.
    const toTop = reorderLocally(items, 3, 0);
    expect(computeMinimalMoves(items, toTop, (item) => item.id)).toEqual([
      { anchor: { before: 'a' }, id: 'd' },
    ]);

    // Move first item to last -> relative { after: 'd' }.
    const toBottom = reorderLocally(items, 0, 3);
    expect(computeMinimalMoves(items, toBottom, (item) => item.id)).toEqual([
      { anchor: { after: 'd' }, id: 'a' },
    ]);

    // Arbitrary permutation round-trips cleanly.
    const reversed = items.reduceRight<Item[]>((acc, item) => {
      acc.push(item);
      return acc;
    }, []);
    const moves = computeMinimalMoves(items, reversed, (item) => item.id);
    expect(moves.length).toBe(3);
    expect(applyMovesLocally(items, moves)).toEqual(reversed);
  });

  test('computeMinimalMoves stays scoped inside a larger list with pinned head and neighbor group', () => {
    const fullList: Item[] = [
      { id: 'pinned', pinned: true },
      { id: 'e1' },
      { id: 'e2' },
      { id: 'e3' },
      { id: 'd1' },
    ];
    const oldSubgroup = fullList.slice(1, 4);
    const newSubgroup = reorderLocally(oldSubgroup, 2, 0); // [e3, e1, e2]
    const moves = computeMinimalMoves(oldSubgroup, newSubgroup, (item) => item.id);

    expect(moves).toEqual([{ anchor: { before: 'e1' }, id: 'e3' }]);
    expect(applyMovesLocally(fullList, moves).map((i) => i.id)).toEqual([
      'pinned',
      'e3',
      'e1',
      'e2',
      'd1',
    ]);
  });

  test('applySublistOrderToList reorders matched slots while keeping unrelated items fixed', () => {
    const fullList: Item[] = [
      { id: 'cherryai' },
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
      { id: 'z' },
    ];
    expect(
      applySublistOrderToList(fullList, ['c', 'a', 'b'], (item) => item.id).map((i) => i.id),
    ).toEqual(['cherryai', 'c', 'a', 'b', 'z']);

    // Partial cache subset (e.g. enabled-only cache missing 'a'):
    const subset: Item[] = [{ id: 'b' }, { id: 'c' }];
    expect(
      applySublistOrderToList(subset, ['c', 'a', 'b'], (item) => item.id).map((i) => i.id),
    ).toEqual(['c', 'b']);
  });

  test('applySublistOrderToCacheData updates arrays, wrapped pages, and infinite pages', () => {
    expect(
      (applySublistOrderToCacheData(items, ['c', 'a', 'b', 'd'], (i: Item) => i.id) as Item[]).map(
        (i) => i.id,
      ),
    ).toEqual(['c', 'a', 'b', 'd']);

    const counted = { items, page: 1, total: 4 };
    expect(applySublistOrderToCacheData(counted, ['d', 'a', 'b', 'c'], (i: Item) => i.id)).toEqual({
      items: [{ id: 'd' }, { id: 'a' }, { id: 'b' }, { id: 'c' }],
      page: 1,
      total: 4,
    });

    const infinite: InfiniteData<CursorPaginationResponse<Item>, string | undefined> = {
      pageParams: [undefined, 'cursor-1'],
      pages: [
        { items: [{ id: 'cherryai' }, { id: 'a' }], nextCursor: 'cursor-1' },
        { items: [{ id: 'b' }, { id: 'c' }, { id: 'disabled' }], nextCursor: undefined },
      ],
    };
    expect(applySublistOrderToCacheData(infinite, ['c', 'a', 'b'], (i: Item) => i.id)).toEqual({
      pageParams: [undefined, 'cursor-1'],
      pages: [
        { items: [{ id: 'cherryai' }, { id: 'c' }], nextCursor: 'cursor-1' },
        { items: [{ id: 'a' }, { id: 'b' }, { id: 'disabled' }], nextCursor: undefined },
      ],
    });
  });
});
