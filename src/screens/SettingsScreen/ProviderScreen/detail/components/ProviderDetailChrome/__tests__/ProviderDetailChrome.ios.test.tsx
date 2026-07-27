import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ProviderDetailChrome } from '../ProviderDetailChrome.ios';

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const ToolbarRoot = (props: { children?: React.ReactNode; placement?: string }) =>
    React.createElement('Toolbar', props, props.children);
  const Toolbar = Object.assign(ToolbarRoot, {
    Button: (props: { children?: React.ReactNode; onPress?: () => void }) =>
      React.createElement('ToolbarButton', props, props.children),
    Spacer: () => null,
  });

  return { Color: { ios: { systemRed: 'system-red' } }, Stack: { Toolbar } };
});

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
});
