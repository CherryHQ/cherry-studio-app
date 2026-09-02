import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { HeaderActionGroup } from '../HeaderActionGroup.android';

jest.mock('@cherrystudio/ui/components', () => ({
  Menu: ({ children }: { children: ReactElement }) => children,
}));

jest.mock('@cherrystudio/ui/utils', () => ({
  cn: (...values: (false | null | string | undefined)[]) => values.filter(Boolean).join(' '),
}));

describe('HeaderActionGroup.android', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('keeps adjacent actions in separate 48dp targets around the inset surface', () => {
    const Icon = () => null;

    act(() => {
      renderer = create(
        <HeaderActionGroup
          actions={[
            {
              accessibilityLabel: 'First',
              icon: Icon,
              key: 'first',
              onPress: jest.fn(),
              type: 'icon',
            },
            {
              accessibilityLabel: 'Second',
              icon: Icon,
              key: 'second',
              onPress: jest.fn(),
              type: 'icon',
            },
          ]}
          placement="right"
        />,
      );
    });

    const group = renderer!.root.findByProps({ className: 'relative flex-row items-center' });
    const surface = group.findByProps({ pointerEvents: 'none' });
    const actions = renderer!.root.findAll(
      (node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button',
    );

    expect(surface.props.className).toContain('absolute inset-1');
    expect(actions).toHaveLength(2);
    actions.forEach((action) => {
      expect(action.props.className.split(' ')).toContain('size-12');
      expect(action.props.hitSlop).toBeUndefined();
    });
  });
});
