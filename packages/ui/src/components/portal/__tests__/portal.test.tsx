import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Portal } from '../portal';

jest.mock('heroui-native/portal', () => ({
  Portal: ({ children, ...props }: { children?: React.ReactNode }) => {
    const React = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');

    return React.createElement(View, { ...props, mockComponent: 'hero-portal' }, children);
  },
}));

describe('Portal', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('forwards the portal target and content to HeroUI', () => {
    act(() => {
      renderer = create(
        <Portal hostName="media-overlays" name="camera-controls">
          <Text>Controls</Text>
        </Portal>,
      );
    });

    const portal = renderer!.root.findByProps({ mockComponent: 'hero-portal' });

    expect(portal.props.hostName).toBe('media-overlays');
    expect(portal.props.name).toBe('camera-controls');
    expect(renderer!.root.findByType(Text).props.children).toBe('Controls');
  });
});
