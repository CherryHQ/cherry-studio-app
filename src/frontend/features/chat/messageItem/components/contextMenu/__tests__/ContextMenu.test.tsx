import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ContextMenu } from '..';

let mockMenuProps: Record<string, unknown> = {};

jest.mock('@expo/ui/community/menu', () => ({
  MenuView: ({ children, ...props }: { children?: ReactNode }) => {
    const { View: MockView } = jest.requireActual('react-native');
    mockMenuProps = props;
    return <MockView>{children}</MockView>;
  },
}));

describe('ContextMenu', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    mockMenuProps = {};
  });

  test('adapts feature actions to the Expo UI native menu', () => {
    const onPressAction = jest.fn();

    act(() => {
      renderer = create(
        <ContextMenu
          actions={[
            { id: 'copy', image: 'doc.on.doc', title: 'Copy' },
            { destructive: true, disabled: true, id: 'delete', title: 'Delete' },
          ]}
          onPressAction={onPressAction}
          title="Message"
        >
          <Text>Trigger</Text>
        </ContextMenu>,
      );
    });

    expect(mockMenuProps).toMatchObject({
      actions: [
        {
          attributes: { destructive: undefined, disabled: undefined },
          id: 'copy',
          image: 'doc.on.doc',
          title: 'Copy',
        },
        {
          attributes: { destructive: true, disabled: true },
          id: 'delete',
          title: 'Delete',
        },
      ],
      shouldOpenOnLongPress: true,
      title: 'Message',
    });

    act(() => {
      (mockMenuProps.onPressAction as (event: { nativeEvent: { event: string } }) => void)({
        nativeEvent: { event: 'copy' },
      });
    });
    expect(onPressAction).toHaveBeenCalledWith('copy');
  });
});
