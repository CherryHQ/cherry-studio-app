import type { ReactElement, ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackHeader } from './BackHeader';

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');

  return {
    Stack: {
      Screen: (props: { options: Record<string, unknown> }) =>
        React.createElement('StackScreen', props),
    },
    useRouter: () => ({ back: jest.fn() }),
  };
});

jest.mock('@cherrystudio/app-icons', () => ({ ChevronLeftIcon: () => null }));

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');

  return {
    Menu: ({ children, items }: { children: ReactNode; items: readonly unknown[] }) =>
      React.createElement('Menu', { items }, children),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('BackHeader.android', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('clears custom title and right actions when later states omit them', async () => {
    await act(async () => {
      renderer = create(
        <BackHeader
          rightActions={[{ key: 'edit', label: 'Edit', onPress: jest.fn(), type: 'label' }]}
          title="Config"
          titleElement={<Text>Tabs</Text>}
        />,
      );
    });

    expect(getOptions().headerRight).toEqual(expect.any(Function));
    expect(getOptions().headerTitle).toEqual(expect.any(Function));
    expect(getOptions().title).toBe('');

    await act(async () => {
      renderer?.update(
        <BackHeader
          rightActions={[{ key: 'save', label: 'Save', onPress: jest.fn(), type: 'label' }]}
          title="Config"
        />,
      );
    });

    expect(getOptions().headerRight).toEqual(expect.any(Function));
    expect(getOptions().headerTitle).toBeUndefined();
    expect(getOptions().title).toBe('Config');

    await act(async () => {
      renderer?.update(<BackHeader title="Config" />);
    });

    expect(getOptions().headerRight).toBeUndefined();
    expect(getOptions().headerTitle).toBeUndefined();
    expect(getOptions().title).toBe('Config');
  });

  it('renders a toolbar menu action with its declared items', async () => {
    const menuItems = [{ id: 'add', label: 'Add model', onPress: jest.fn() }];
    const MoreIcon = () => null;

    await act(async () => {
      renderer = create(
        <BackHeader
          rightActions={[
            {
              accessibilityLabel: 'More',
              icon: MoreIcon,
              items: menuItems,
              key: 'more',
              type: 'menu',
            },
          ]}
          title="Models"
        />,
      );
    });

    const headerRight = getOptions().headerRight as () => ReactElement<{
      children: ReactElement<{ action: { items: readonly unknown[] } }>[];
    }>;
    expect(headerRight().props.children[0]?.props.action.items).toBe(menuItems);
  });

  function getOptions(): Record<string, unknown> {
    if (!renderer) {
      throw new Error('BackHeader renderer was not created.');
    }
    return renderer.root.findByType('StackScreen').props.options;
  }
});
