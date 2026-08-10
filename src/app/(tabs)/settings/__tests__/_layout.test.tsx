import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import SettingsStackLayout from '../_layout';

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');

  const Stack = Object.assign(
    ({ children, ...props }: { children?: ReactNode }) =>
      React.createElement('Stack', props, children),
    {
      Screen: (props: object) => React.createElement('StackScreen', props),
    },
  );

  return { Stack };
});

jest.mock('@/frontend/hooks/useThemeColor', () => ({
  useThemeColor: () => '#ffffff',
}));

jest.mock('@/frontend/utils/constants', () => ({
  isIOS: true,
  isLiquidGlassAvailable: true,
}));

describe('SettingsStackLayout', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('keeps sub-screen content from showing behind the native header', () => {
    act(() => {
      renderer = create(<SettingsStackLayout />);
    });

    const stack = renderer!.root.findByType('Stack');
    expect(stack.props.screenOptions.headerTransparent).toBe(false);
  });
});
