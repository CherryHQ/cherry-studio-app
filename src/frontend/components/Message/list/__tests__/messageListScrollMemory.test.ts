import { computeScrollAnchor, resolveRestoreTarget } from '../messageListScrollMemory';

describe('messageListScrollMemory', () => {
  test('stores a semantic item key plus the offset inside that item', () => {
    expect(
      computeScrollAnchor({
        getKeyAtIndex: (index) => (index === 3 ? 'message-3' : null),
        getOffsetAtIndex: () => 600,
        scrollOffset: 632,
        topIndex: 3,
      }),
    ).toEqual({ key: 'message-3', offset: 32 });
  });

  test('stores no anchor when the top row has no key to anchor to', () => {
    expect(
      computeScrollAnchor({
        getKeyAtIndex: () => null,
        getOffsetAtIndex: () => 600,
        scrollOffset: 632,
        topIndex: 3,
      }),
    ).toBeNull();
  });

  test('restores an existing key and falls back to the newest row', () => {
    expect(resolveRestoreTarget({ key: 'message-2', offset: 18 }, () => 2, 5)).toEqual({
      align: 'start',
      index: 2,
      offset: 18,
    });
    expect(resolveRestoreTarget({ key: 'deleted', offset: 18 }, () => -1, 5)).toEqual({
      align: 'end',
      index: 5,
      offset: 0,
    });
  });
});
