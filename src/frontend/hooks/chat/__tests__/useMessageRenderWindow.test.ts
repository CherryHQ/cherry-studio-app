import { getVisibleCountForWindow } from '../useMessageRenderWindow';

describe('getVisibleCountForWindow', () => {
  test('uses the initial render count for a new message window', () => {
    expect(
      getVisibleCountForWindow(12, null, {
        firstId: 'first',
        lastId: 'last',
        length: 12,
      }),
    ).toBe(4);
  });

  test('keeps the current visible count when the same window changes without a new tail', () => {
    expect(
      getVisibleCountForWindow(
        8,
        {
          firstId: 'first',
          lastId: 'last',
          length: 12,
        },
        {
          firstId: 'first',
          lastId: 'last',
          length: 12,
        },
      ),
    ).toBe(8);
  });

  test('adds appended messages when the window grows at the tail', () => {
    expect(
      getVisibleCountForWindow(
        4,
        {
          firstId: 'first',
          lastId: 'old-last',
          length: 4,
        },
        {
          firstId: 'first',
          lastId: 'new-last',
          length: 6,
        },
      ),
    ).toBe(6);
  });

  test('adds prepended messages when the window grows at the head', () => {
    expect(
      getVisibleCountForWindow(
        12,
        {
          firstId: 'old-first',
          lastId: 'last',
          length: 12,
        },
        {
          firstId: 'new-first',
          lastId: 'last',
          length: 24,
        },
      ),
    ).toBe(24);
  });

  test('resets to the initial render count when the window is replaced', () => {
    expect(
      getVisibleCountForWindow(
        12,
        {
          firstId: 'old-first',
          lastId: 'old-last',
          length: 12,
        },
        {
          firstId: 'new-first',
          lastId: 'new-last',
          length: 12,
        },
      ),
    ).toBe(4);
  });
});
