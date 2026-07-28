import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ProviderDetailChrome } from '../ProviderDetailChrome.android';

jest.mock('lucide-uniwind/png', () => ({
  ActivityIcon: () => null,
  PauseIcon: () => null,
  PlayIcon: () => null,
  RefreshCcwIcon: () => null,
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
        'settings.provider.models.check': 'Check models',
        'settings.provider.models.pull': 'Pull models',
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

  it('wires pull and check when the models tab supplies them', async () => {
    const onCheck = jest.fn();
    const onPull = jest.fn();

    await act(async () => {
      renderer = create(
        <ProviderDetailChrome
          canDelete={false}
          checkAction={{ onPress: onCheck }}
          isActive
          isDisabled={false}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
          pullAction={{ isLoading: true, onPress: onPull }}
        />,
      );
    });

    if (!renderer) {
      throw new Error('ProviderDetailChrome test renderer was not created.');
    }

    const [pull] = renderer.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Pull models' && typeof node.props.onPress === 'function',
    );
    const [check] = renderer.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Check models' &&
        typeof node.props.onPress === 'function',
    );

    check.props.onPress();

    expect(pull.props.disabled).toBe(true);
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it('omits pull and check outside the models tab', async () => {
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

    expect(renderer?.root.findAllByProps({ accessibilityLabel: 'Pull models' })).toHaveLength(0);
    expect(renderer?.root.findAllByProps({ accessibilityLabel: 'Check models' })).toHaveLength(0);
  });
});
