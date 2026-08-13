import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackHeader } from './BackHeader.android';

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

jest.mock('heroui-native/utils', () => ({ cn: (...values: string[]) => values.join(' ') }));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('../components/HeaderIconButton', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { HeaderIconButton: MockView };
});

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
          rightActions={[{ key: 'edit', label: 'Edit', onPress: jest.fn() }]}
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
          rightActions={[{ key: 'save', label: 'Save', onPress: jest.fn() }]}
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

  function getOptions(): Record<string, unknown> {
    if (!renderer) {
      throw new Error('BackHeader renderer was not created.');
    }
    return renderer.root.findByType('StackScreen').props.options;
  }
});
