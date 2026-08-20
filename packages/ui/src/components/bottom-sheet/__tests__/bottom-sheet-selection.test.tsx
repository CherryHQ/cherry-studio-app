import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BottomSheetSelection } from '../bottom-sheet-selection';

let mockHandleSheetClose: ((reason: string) => void) | undefined;
let mockListExtraData: unknown;
const mockRequestClose = jest.fn((reason: string) => mockHandleSheetClose?.(reason));

jest.mock('../bottom-sheet', () => {
  const { View } = jest.requireActual('react-native');

  return {
    BottomSheetBody: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    BottomSheetContent: ({
      children,
      onClose,
    }: {
      children: React.ReactNode;
      onClose: typeof mockHandleSheetClose;
    }) => {
      mockHandleSheetClose = onClose;
      return <View>{children}</View>;
    },
    BottomSheetRoot: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('../bottom-sheet-header', () => {
  const { View } = jest.requireActual('react-native');
  const Component = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;

  return {
    BottomSheetCloseButton: Component,
    BottomSheetHeader: Component,
    BottomSheetHeaderSpacer: Component,
    BottomSheetTitle: Component,
  };
});

jest.mock('../bottom-sheet.context', () => ({
  useBottomSheet: () => ({ requestClose: mockRequestClose }),
}));

jest.mock('@legendapp/list/react-native', () => ({
  LegendList: ({
    data,
    extraData,
    renderItem,
  }: {
    data: { label: string; value: string }[];
    extraData: unknown;
    renderItem: (info: {
      index: number;
      item: { label: string; value: string };
    }) => React.ReactNode;
  }) => {
    const { Fragment } = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');
    mockListExtraData = extraData;
    return (
      <View>
        {data.map((item, index) => (
          <Fragment key={item.value}>{renderItem({ index, item })}</Fragment>
        ))}
      </View>
    );
  },
}));

jest.mock('@cherrystudio/app-icons', () => ({
  CheckIcon: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 59 }),
}));

describe('BottomSheet.Selection', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHandleSheetClose = undefined;
    mockListExtraData = undefined;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('commits a selected value after requesting the sheet close', () => {
    const calls: string[] = [];
    const onClose = jest.fn(() => calls.push('close'));
    const onSelect = jest.fn((value: string) => calls.push(`select:${value}`));

    act(() => {
      renderer = create(
        <BottomSheetSelection
          closeAccessibilityLabel="Close"
          emptyText="No options"
          onClose={onClose}
          onSelect={onSelect}
          open
          options={[
            { label: 'First', value: 'first' },
            { label: 'Second', value: 'second' },
          ]}
          selectedValue="first"
          testID="selection"
          title="Choose"
        />,
      );
    });

    const rows = renderer!.root.findAll(
      (node) =>
        node.props.accessibilityRole === 'radio' &&
        Object.keys(node.props.accessibilityState ?? {}).length === 1,
    );
    expect(rows.map((row) => row.props.accessibilityState)).toEqual([
      { checked: true },
      { checked: false },
    ]);

    act(() => rows[1].props.onPress());

    expect(mockRequestClose).toHaveBeenCalledWith('selection');
    expect(calls).toEqual(['close', 'select:second']);
  });

  test('invalidates recycled rows when the selected value changes', () => {
    const props = {
      closeAccessibilityLabel: 'Close',
      emptyText: 'No options',
      onClose: jest.fn(),
      onSelect: jest.fn(),
      open: true,
      options: [
        { label: 'First', value: 'first' },
        { label: 'Second', value: 'second' },
      ],
      testID: 'selection',
      title: 'Choose',
    } as const;

    act(() => {
      renderer = create(<BottomSheetSelection {...props} selectedValue="first" />);
    });
    expect(mockListExtraData).toBe('first');

    act(() => {
      renderer!.update(<BottomSheetSelection {...props} selectedValue="second" />);
    });
    expect(mockListExtraData).toBe('second');
  });
});
