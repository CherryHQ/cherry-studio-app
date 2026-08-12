import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ProviderDetailChrome } from '../ProviderDetailChrome.ios';

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const ToolbarRoot = (props: { children?: React.ReactNode; placement?: string }) =>
    React.createElement('Toolbar', props, props.children);
  const Toolbar = Object.assign(ToolbarRoot, {
    Button: (props: { children?: React.ReactNode; onPress?: () => void }) =>
      React.createElement('ToolbarButton', props, props.children),
    Spacer: () => React.createElement('ToolbarSpacer'),
    View: (props: { children?: React.ReactNode }) =>
      React.createElement('ToolbarView', props, props.children),
  });

  return { Color: { ios: { systemRed: 'system-red' } }, Stack: { Toolbar } };
});

// The real module reaches for the worklets native binding and throws on import.
jest.mock('react-native-reanimated', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: { View: MockView },
    Easing: { linear: 'linear' },
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (value: number) => ({ value }),
    withRepeat: (value: number) => value,
    withTiming: (value: number) => value,
  };
});

jest.mock('lucide-uniwind/png', () => ({ RefreshCcwIcon: () => null }));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'settings.provider.deleteProvider': 'Delete provider',
        'settings.provider.disableProvider': 'Disable provider',
        'settings.provider.enableProvider': 'Enable provider',
        'settings.provider.models.pull': 'Pull models',
        'settings.provider.models.selection.deselectAll': 'Deselect all',
        'settings.provider.models.selection.selectAll': 'Select all',
        'settings.provider.models.selection.start': 'Select models',
      })[key] ?? key,
  }),
}));

describe('ProviderDetailChrome.ios', () => {
  let renderer: ReactTestRenderer | undefined;
  const onDelete = jest.fn();
  const onToggleActive = jest.fn();

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('renders enable and delete actions in the bottom toolbar', async () => {
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

    const toolbar = renderer.root.findByType('Toolbar');
    const [toggle, remove] = renderer.root.findAllByType('ToolbarButton');

    expect(toolbar.props.placement).toBe('bottom');
    expect(toggle.props.accessibilityLabel).toBe('Enable provider');
    expect(toggle.props.icon).toBe('play');
    expect(remove.props.accessibilityLabel).toBe('Delete provider');
    expect(remove.props.icon).toBe('trash');
    expect(remove.props.tintColor).toBe('system-red');

    toggle.props.onPress();
    remove.props.onPress();

    expect(onToggleActive).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('hides delete for a built-in provider and shows the active state', async () => {
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

    const [toggle] = renderer?.root.findAllByType('ToolbarButton') ?? [];
    expect(renderer?.root.findAllByType('ToolbarButton')).toHaveLength(1);
    expect(toggle.props.accessibilityLabel).toBe('Disable provider');
    expect(toggle.props.icon).toBe('pause');
  });

  it('orders the toolbar as toggle, pull, delete', async () => {
    const onPull = jest.fn();

    await act(async () => {
      renderer = create(
        <ProviderDetailChrome
          canDelete
          isActive
          isDisabled={false}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
          pullAction={{ onPress: onPull }}
        />,
      );
    });

    if (!renderer) {
      throw new Error('ProviderDetailChrome test renderer was not created.');
    }

    const items = renderer.root
      .findByType('Toolbar')
      .findAll((node) => node.type === 'ToolbarButton' || node.type === 'ToolbarSpacer');

    // The trailing spacer is what keeps a lone toggle off the toolbar's centre.
    expect(items.map((item) => item.props.accessibilityLabel ?? item.type)).toEqual([
      'Disable provider',
      'Pull models',
      'Delete provider',
      'ToolbarSpacer',
    ]);
    expect(items[1].props.icon).toBe('arrow.trianglehead.2.clockwise.rotate.90');

    items[1].props.onPress();

    expect(onPull).toHaveBeenCalledTimes(1);
  });

  it('disables an action while it is in flight', async () => {
    await act(async () => {
      renderer = create(
        <ProviderDetailChrome
          canDelete={false}
          isActive
          isDisabled={false}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
          pullAction={{ isDisabled: true, onPress: jest.fn() }}
        />,
      );
    });

    const [pull] = renderer?.root.findAllByProps({ accessibilityLabel: 'Pull models' }) ?? [];

    expect(pull.props.disabled).toBe(true);
  });

  // A native bar button item cannot animate its SF Symbol, so the spinner has to
  // arrive as a custom view in the button's place.
  it('swaps the pull button for a spinning view while the pull runs', async () => {
    await act(async () => {
      renderer = create(
        <ProviderDetailChrome
          canDelete={false}
          isActive
          isDisabled={false}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
          pullAction={{ isLoading: true, onPress: jest.fn() }}
        />,
      );
    });

    if (!renderer) {
      throw new Error('ProviderDetailChrome test renderer was not created.');
    }

    expect(renderer.root.findAllByType('ToolbarView')).toHaveLength(1);
    expect(
      renderer.root
        .findAllByType('ToolbarButton')
        .filter((button) => button.props.accessibilityLabel === 'Pull models'),
    ).toHaveLength(0);
  });

  it('offers the edit action between pull and delete', async () => {
    const onEdit = jest.fn();

    await act(async () => {
      renderer = create(
        <ProviderDetailChrome
          canDelete
          editAction={{ isDisabled: false, onPress: onEdit }}
          isActive
          isDisabled={false}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
          pullAction={{ onPress: jest.fn() }}
        />,
      );
    });

    if (!renderer) {
      throw new Error('ProviderDetailChrome test renderer was not created.');
    }

    const labels = renderer.root
      .findAllByType('ToolbarButton')
      .map((button) => button.props.accessibilityLabel);

    expect(labels).toEqual(['Disable provider', 'Pull models', 'Select models', 'Delete provider']);

    renderer.root.findByProps({ accessibilityLabel: 'Select models' }).props.onPress();

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  // Selecting models has nothing to do with the provider's own actions, and
  // leaving "delete provider" up invites deleting it mid-selection.
  it('replaces the whole bar with select-all while selecting', async () => {
    const onToggleAll = jest.fn();

    await act(async () => {
      renderer = create(
        <ProviderDetailChrome
          canDelete
          editAction={{ isDisabled: false, onPress: jest.fn() }}
          isActive
          isDisabled={false}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
          pullAction={{ onPress: jest.fn() }}
          selection={{ isAllSelected: false, onToggleAll }}
        />,
      );
    });

    if (!renderer) {
      throw new Error('ProviderDetailChrome test renderer was not created.');
    }

    const buttons = renderer.root.findAllByType('ToolbarButton');

    expect(buttons).toHaveLength(1);
    expect(buttons[0].props.children).toBe('Select all');

    buttons[0].props.onPress();

    expect(onToggleAll).toHaveBeenCalledTimes(1);
  });

  it('offers to undo a full selection', async () => {
    await act(async () => {
      renderer = create(
        <ProviderDetailChrome
          canDelete
          isActive
          isDisabled={false}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
          selection={{ isAllSelected: true, onToggleAll: jest.fn() }}
        />,
      );
    });

    expect(renderer?.root.findByType('ToolbarButton').props.children).toBe('Deselect all');
  });

  it('omits pull outside the models tab', async () => {
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
  });
});
