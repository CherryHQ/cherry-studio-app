import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { getVisibleCountForWindow, useMessageRenderWindow } from '../useMessageRenderWindow';

test.each([0, 1, 2])(
  'preserves revealed messages across a rolling history refresh (%s reveals)',
  (reveals) => {
    let renderer: ReactTestRenderer;
    let window!: ReturnType<typeof useMessageRenderWindow<{ id: string }>>;
    const messages = Array.from({ length: 14 }, (_, index) => ({ id: `message-${index + 1}` }));
    function Probe({ items }: { items: { id: string }[] }) {
      window = useMessageRenderWindow(items);
      return null;
    }
    act(() => {
      renderer = create(createElement(Probe, { items: messages.slice(0, 12) }));
    });
    try {
      for (let index = 0; index < reveals; index += 1) {
        act(() => window.revealMore());
      }
      const firstVisibleId = window.visibleMessages[0].id;
      act(() => renderer.update(createElement(Probe, { items: messages.slice(2) })));
      const firstSurvivingIndex = Math.max(
        2,
        messages.findIndex((item) => item.id === firstVisibleId),
      );
      expect(window.visibleMessages).toEqual(messages.slice(firstSurvivingIndex));
    } finally {
      act(() => renderer.unmount());
    }
  },
);

test('keeps a replaced visible row when a later refresh adds messages', () => {
  let renderer: ReactTestRenderer;
  let window!: ReturnType<typeof useMessageRenderWindow<{ id: string }>>;
  const messages = Array.from({ length: 12 }, (_, index) => ({ id: `message-${index + 1}` }));
  function Probe({ items }: { items: { id: string }[] }) {
    window = useMessageRenderWindow(items);
    return null;
  }
  act(() => {
    renderer = create(createElement(Probe, { items: messages }));
  });
  try {
    const replaced = messages.map((message, index) =>
      index === 8 ? { id: 'replacement-answer' } : message,
    );
    act(() => renderer.update(createElement(Probe, { items: replaced })));
    expect(window.visibleMessages).toEqual(replaced.slice(8));
    const refreshed = [...replaced.slice(2), { id: 'new-user' }, { id: 'new-answer' }];
    act(() => renderer.update(createElement(Probe, { items: refreshed })));
    expect(window.visibleMessages).toEqual(refreshed.slice(6));
  } finally {
    act(() => renderer.unmount());
  }
});

function signature(ids: string[]) {
  return { firstId: ids[0], ids, lastId: ids[ids.length - 1], length: ids.length };
}

const ids = Array.from({ length: 24 }, (_, index) => `message-${index + 1}`);

describe('getVisibleCountForWindow', () => {
  test('uses the initial render count for a new message window', () => {
    expect(getVisibleCountForWindow(12, null, signature(ids.slice(0, 12)))).toBe(4);
  });

  test('keeps the current visible count when the same window changes without a new tail', () => {
    const window = signature(ids.slice(0, 12));
    expect(getVisibleCountForWindow(8, window, window)).toBe(8);
  });

  test('adds appended messages when the window grows at the tail', () => {
    expect(
      getVisibleCountForWindow(4, signature(ids.slice(0, 4)), signature(ids.slice(0, 6))),
    ).toBe(6);
  });

  test('adds prepended messages when the window grows at the head', () => {
    expect(getVisibleCountForWindow(12, signature(ids.slice(12)), signature(ids))).toBe(24);
  });

  test('keeps surviving rendered rows when messages are removed', () => {
    expect(
      getVisibleCountForWindow(8, signature(ids.slice(0, 12)), signature(ids.slice(0, 11))),
    ).toBe(7);
  });

  test('resets to the initial render count when the window is replaced', () => {
    expect(
      getVisibleCountForWindow(12, signature(ids.slice(0, 12)), signature(ids.slice(12))),
    ).toBe(4);
  });
});
