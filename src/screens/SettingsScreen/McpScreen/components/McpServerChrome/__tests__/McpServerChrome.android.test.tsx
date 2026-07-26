import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { McpServerChrome } from '../McpServerChrome.android';

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
        'common.delete': 'Delete',
        'settings.mcp.deleteServer': 'Delete server',
        'settings.mcp.disableServer': 'Disable',
        'settings.mcp.enableServer': 'Enable',
      })[key] ?? key,
  }),
}));

describe('McpServerChrome.android', () => {
  let renderer: ReactTestRenderer | undefined;
  const onDelete = jest.fn();
  const onToggleActive = jest.fn();

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('wires the enable and delete controls', async () => {
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

    const [toggle] = renderer.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Enable' && typeof node.props.onPress === 'function',
    );
    const [remove] = renderer.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Delete server' &&
        typeof node.props.onPress === 'function',
    );

    toggle.props.onPress();
    remove.props.onPress();

    expect(toggle.props.accessibilityState).toEqual({ disabled: false, selected: false });
    expect(onToggleActive).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
