import { Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SelectionToolbar as AndroidSelectionToolbar } from '../SelectionToolbar/SelectionToolbar.android';
import { SelectionToolbar as IOSSelectionToolbar } from '../SelectionToolbar/SelectionToolbar.ios';
import type { SelectionToolbarProps } from '../SelectionToolbar/types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    FadeInDown: { duration: () => undefined },
    FadeOutDown: { duration: () => undefined },
  };
});

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { Pressable, View } = jest.requireActual('react-native');
  const Toolbar = Object.assign((props: object) => React.createElement(View, props), {
    Button: (props: object) => React.createElement(Pressable, props),
    Spacer: () => null,
  });
  return { Color: { ios: { systemRed: 'red' } }, Stack: { Toolbar } };
});

describe.each([
  ['Android', AndroidSelectionToolbar],
  ['iOS', IOSSelectionToolbar],
] as const)('%s SelectionToolbar', (_platform, Toolbar) => {
  let renderer: ReactTestRenderer;
  const onToggleAll = jest.fn();
  const baseProps: SelectionToolbarProps = {
    allSelected: false,
    isPending: false,
    onDelete: jest.fn(),
    onToggleAll,
    selectableCount: 3,
    selectedCount: 1,
  };

  afterEach(async () => {
    await act(async () => renderer.unmount());
    jest.clearAllMocks();
  });

  it('keeps select all an action when partially selected and switches to deselect all', async () => {
    await act(async () => {
      renderer = create(<Toolbar {...baseProps} />);
    });

    const selectAll = findButton('common.selection.selectAll');
    expect(selectAll.props.disabled).toBe(false);
    act(() => selectAll.props.onPress());
    expect(onToggleAll).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.update(<Toolbar {...baseProps} allSelected selectedCount={3} />);
    });

    expect(findButton('common.selection.deselectAll').props.disabled).toBe(false);
  });

  it.each([
    { isPending: false, selectableCount: 0, selectedCount: 0 },
    { isPending: true, selectableCount: 3, selectedCount: 1 },
  ])('disables unavailable actions for %j', async (state) => {
    await act(async () => {
      renderer = create(
        <Toolbar
          {...baseProps}
          {...state}
          actions={[{ id: 'move', label: 'Move', onPress: jest.fn() }]}
        />,
      );
    });

    expect(findButton('common.selection.selectAll').props.disabled).toBe(true);
    expect(findButton('common.delete').props.disabled).toBe(true);
    expect(findButton('Move').props.disabled).toBe(true);
  });

  function findButton(label: string) {
    const button = renderer.root
      .findAllByType(Pressable)
      .find((node) => node.props.accessibilityLabel === label);
    if (!button) throw new Error(`Missing selection action: ${label}`);
    return button;
  }
});
