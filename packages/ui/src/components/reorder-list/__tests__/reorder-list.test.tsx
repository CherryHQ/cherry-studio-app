import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Button } from '../../button';
import { ReorderList } from '../reorder-list';

jest.mock('../../button', () => ({ Button: 'Button' }));
jest.mock('../../section', () => {
  const React = jest.requireActual('react');
  return {
    Section: Object.assign(
      ({ children }: { children: ReactNode }) => React.createElement('Section', null, children),
      {
        Item: ({ trailing }: { trailing: ReactNode }) =>
          React.createElement('Item', null, trailing),
      },
    ),
  };
});

const items = [
  { id: 'a', name: 'Work', metadata: { enabled: true } },
  { id: 'b', name: 'Personal', metadata: { enabled: false } },
  { id: 'c', name: 'Backup', metadata: { enabled: true } },
];

describe('ReorderList', () => {
  let renderer: ReactTestRenderer;
  const onReorder = jest.fn();
  function render() {
    return (
      <ReorderList
        getItemKey={(item) => item.id}
        getItemLabel={(item) => item.name}
        items={items}
        labels={{ moveDown: (item) => `Down ${item.name}`, moveUp: (item) => `Up ${item.name}` }}
        onReorder={onReorder}
      />
    );
  }
  beforeEach(() => {
    onReorder.mockReset();
    act(() => {
      renderer = create(render());
    });
  });
  afterEach(() => act(() => renderer.unmount()));

  function button(label: string) {
    return renderer.root
      .findAllByType(Button)
      .find((node) => node.props.accessibilityLabel === label)!;
  }

  it('moves the entire item without mutating the controlled input or its metadata', () => {
    act(() => button('Up Personal').props.onPress());
    const reordered = onReorder.mock.calls[0][0];
    expect(reordered.map((item: (typeof items)[number]) => item.id)).toEqual(['b', 'a', 'c']);
    expect(reordered[0]).toBe(items[1]);
    expect(reordered[0].metadata.enabled).toBe(false);
    expect(items.map((item) => item.id)).toEqual(['a', 'b', 'c']);

    act(() => button('Down Personal').props.onPress());
    expect(onReorder.mock.calls[1][0].map((item: (typeof items)[number]) => item.id)).toEqual([
      'a',
      'c',
      'b',
    ]);
  });

  it('disables moves past the first and last positions', () => {
    expect(button('Up Work').props.disabled).toBe(true);
    expect(button('Down Backup').props.disabled).toBe(true);
    act(() => {
      button('Up Work').props.onPress();
      button('Down Backup').props.onPress();
    });
    expect(onReorder).not.toHaveBeenCalled();
  });
});
