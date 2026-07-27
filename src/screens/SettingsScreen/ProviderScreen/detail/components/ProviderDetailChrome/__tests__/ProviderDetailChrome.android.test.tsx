import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ProviderDetailChrome } from '../ProviderDetailChrome.android';

jest.mock('lucide-uniwind/png', () => ({
  PauseIcon: () => null,
  PlayIcon: () => null,
  Trash2Icon: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 24 }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'settings.provider.deleteProvider': 'Delete provider',
        'settings.provider.disableProvider': 'Disable provider',
        'settings.provider.enableProvider': 'Enable provider',
      })[key] ?? key,
  }),
}));

describe('ProviderDetailChrome.android', () => {
  let renderer: ReactTestRenderer | undefined;
  const onDelete = jest.fn();
  const onToggleActive = jest.fn();

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('wires the enable and delete controls', async () => {
    await act(async () => {
      renderer = create(
        <ProviderDetailChrome
          canDelete
          isActive={false}
          isDisabled={false}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
        />,
      );
    });

    if (!renderer) {
      throw new Error('ProviderDetailChrome test renderer was not created.');
    }

    const [toggle] = renderer.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Enable provider' &&
        typeof node.props.onPress === 'function',
    );
    const [remove] = renderer.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Delete provider' &&
        typeof node.props.onPress === 'function',
    );

    toggle.props.onPress();
    remove.props.onPress();

    expect(toggle.props.accessibilityState).toEqual({ disabled: false, selected: false });
    expect(onToggleActive).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('does not render delete when the provider cannot be removed', async () => {
    await act(async () => {
      renderer = create(
        <ProviderDetailChrome
          canDelete={false}
          isActive
          isDisabled={false}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
        />,
      );
    });

    expect(renderer?.root.findAllByProps({ accessibilityLabel: 'Delete provider' })).toHaveLength(
      0,
    );
    expect(
      renderer?.root.findAllByProps({ accessibilityLabel: 'Disable provider' }),
    ).not.toHaveLength(0);
  });
});
