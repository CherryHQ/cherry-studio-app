import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SingleSelectionSheet } from '../components/SingleSelectionSheet';

let mockHandleSheetClose: ((reason: string) => void) | undefined;
const mockRequestClose = jest.fn((reason: string) => mockHandleSheetClose?.(reason));

jest.mock('@cherrystudio/ui/components', () => ({
  BottomSheet: ({
    children,
    onClose,
  }: {
    children: React.ReactNode;
    onClose: typeof mockHandleSheetClose;
  }) => {
    const { View: MockView } = jest.requireActual('react-native');
    mockHandleSheetClose = onClose;
    return <MockView>{children}</MockView>;
  },
  useBottomSheet: () => ({ requestClose: mockRequestClose }),
}));

jest.mock('@legendapp/list/react-native', () => ({
  LegendList: ({
    data,
    renderItem,
  }: {
    data: { label: string; value: string }[];
    renderItem: (info: {
      index: number;
      item: { label: string; value: string };
    }) => React.ReactNode;
  }) => {
    const { Fragment } = jest.requireActual('react');
    const { View: MockView } = jest.requireActual('react-native');
    return (
      <MockView>
        {data.map((item, index) => (
          <Fragment key={item.value}>{renderItem({ index, item })}</Fragment>
        ))}
      </MockView>
    );
  },
}));

jest.mock('@cherrystudio/app-icons', () => ({
  CheckIcon: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 59 }),
}));

jest.mock('../components/SelectionSheetSearchField', () => ({
  SelectionSheetSearchField: () => null,
}));

describe('SingleSelectionSheet', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHandleSheetClose = undefined;
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
        <SingleSelectionSheet
          closeAccessibilityLabel="Close"
          emptyText="No options"
          isOpen
          onClose={onClose}
          onSelect={onSelect}
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
});
