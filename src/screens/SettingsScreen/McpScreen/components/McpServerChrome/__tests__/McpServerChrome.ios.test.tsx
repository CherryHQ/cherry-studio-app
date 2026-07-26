import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { McpServerChrome } from '../McpServerChrome.ios';

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
        'common.delete': 'Delete',
        'settings.mcp.deleteServer': 'Delete server',
        'settings.mcp.disableServer': 'Disable',
        'settings.mcp.enableServer': 'Enable',
      })[key] ?? key,
  }),
}));

describe('McpServerChrome.ios', () => {
  let renderer: ReactTestRenderer | undefined;
  const onDelete = jest.fn();
  const onToggleActive = jest.fn();

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('renders enable and destructive delete actions in the bottom toolbar', async () => {
    await act(async () => {
      renderer = create(
        <McpServerChrome
          isActive={false}
          isDeleting={false}
          isUpdating={false}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
        />,
      );
    });

    if (!renderer) {
      throw new Error('McpServerChrome test renderer was not created.');
    }

    const toolbar = renderer.root.findByType('Toolbar');
    const [toggle, remove] = renderer.root.findAllByType('ToolbarButton');

    expect(toolbar.props.placement).toBe('bottom');
    expect(toggle.props.children).toBeUndefined();
    expect(toggle.props.icon).toBe('play');
    expect(toggle.props.selected).toBeUndefined();
    expect(remove.props.children).toBeUndefined();
    expect(remove.props.icon).toBe('trash');
    expect(remove.props.tintColor).toBe('system-red');

    toggle.props.onPress();
    remove.props.onPress();

    expect(onToggleActive).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('shows Disable for an active server', async () => {
    await act(async () => {
      renderer = create(
        <McpServerChrome
          isActive
          isDeleting={false}
          isUpdating={false}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
        />,
      );
    });

    const [toggle] = renderer?.root.findAllByType('ToolbarButton') ?? [];
    expect(toggle.props.children).toBeUndefined();
    expect(toggle.props.icon).toBe('pause');
    expect(toggle.props.selected).toBeUndefined();
  });
});
