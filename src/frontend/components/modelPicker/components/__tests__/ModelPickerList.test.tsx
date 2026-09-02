import { type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ModelPickerList } from '../ModelPickerList';

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
});
