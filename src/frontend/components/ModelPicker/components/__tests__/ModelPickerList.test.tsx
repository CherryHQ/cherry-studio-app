import { type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ModelPickerList } from '../ModelPickerList';

let mockListProps: { keyboardDismissMode: string; keyboardShouldPersistTaps: string } | undefined;

jest.mock('@legendapp/list/react-native', () => {
  const { View } = jest.requireActual('react-native');
  return {
    LegendList: (props: NonNullable<typeof mockListProps>) => {
      mockListProps = props;
      return <View />;
    },
  };
});

jest.mock('@cherrystudio/ui/components', () => {
  const { Pressable: MockPressable, Text: MockText } = jest.requireActual('react-native');
  return {
    Button: ({ children, onPress }: { children: ReactNode; onPress: () => void }) => (
      <MockPressable onPress={onPress} testID="empty-action">
        <MockText>{children}</MockText>
      </MockPressable>
    ),
  };
});

jest.mock('@cherrystudio/ui/utils', () => ({ cn: (...names: unknown[]) => names.join(' ') }));

jest.mock('../ModelPickerFastScroller', () => ({ ModelPickerFastScroller: () => null }));

describe('ModelPickerList empty state', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('offers provider setup only after loading finishes', () => {
    const onPress = jest.fn();
    const element = (isLoading: boolean) => (
      <ModelPickerList
        emptyAction={{ label: 'Add provider', onPress }}
        emptyText="No models"
        isLoading={isLoading}
        listItems={[]}
        loadingText="Loading"
        onSelect={jest.fn()}
        selectedModelId={null}
      />
    );

    act(() => {
      renderer = create(element(true));
    });
    expect(renderer?.root.findAllByProps({ testID: 'empty-action' })).toHaveLength(0);

    act(() => renderer?.update(element(false)));
    act(() => renderer?.root.findByProps({ testID: 'empty-action' }).props.onPress());

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('enables list-driven keyboard dismissal only while model search owns focus', () => {
    const element = (isSearchFocused: boolean) => (
      <ModelPickerList
        isSearchFocused={isSearchFocused}
        listItems={[
          {
            isFirstGroup: true,
            key: 'group',
            provider: {} as never,
            title: 'Models',
            type: 'groupHeader',
          },
        ]}
        onSelect={jest.fn()}
        selectedModelId={null}
      />
    );
    act(() => {
      renderer = create(element(false));
    });
    expect(mockListProps).toMatchObject({
      keyboardDismissMode: 'none',
      keyboardShouldPersistTaps: 'always',
    });
    act(() => renderer?.update(element(true)));
    expect(mockListProps).toMatchObject({
      keyboardDismissMode: 'on-drag',
      keyboardShouldPersistTaps: 'handled',
    });
    act(() => renderer?.update(element(false)));
    expect(mockListProps).toMatchObject({
      keyboardDismissMode: 'none',
      keyboardShouldPersistTaps: 'always',
    });
  });
});
