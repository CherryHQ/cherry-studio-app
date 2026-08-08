import { StyleSheet, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DynamicToast, type DynamicToastContextValue, useDynamicToast } from '..';
import { Collapsed as AndroidCollapsed, Expanded as AndroidExpanded } from '../inner.android';
import { Collapsed as IosCollapsed, Expanded as IosExpanded } from '../inner.ios';

jest.mock('expo-blur', () => {
  const React = jest.requireActual('react');
  const { View: MockView } = jest.requireActual('react-native');

  return {
    BlurView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(MockView, { ...props, testID: 'blur-view' }, children),
  };
});

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  impactAsync: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 47 }),
}));

jest.mock('react-native-reanimated', () => {
  const ReactNative = jest.requireActual('react-native');
  const createSharedValue = (initialValue: unknown) => {
    let value = initialValue;

    return {
      get: () => value,
      set: (nextValue: unknown) => {
        value = nextValue;
      },
    };
  };

  return {
    __esModule: true,
    default: {
      View: ReactNative.View,
      createAnimatedComponent: (component: unknown) => component,
    },
    Easing: {
      bezier: jest.fn(() => jest.fn()),
    },
    createAnimatedComponent: (component: unknown) => component,
    useAnimatedProps: (factory: () => object) => factory(),
    useAnimatedStyle: (factory: () => object) => factory(),
    useDerivedValue: (factory: () => unknown) => ({ get: factory }),
    useSharedValue: createSharedValue,
    withTiming: jest.fn((value: unknown) => value),
  };
});

describe('DynamicToast', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.clearAllMocks();
  });

  it('defaults to the top safe area and supports bottom placement', () => {
    act(() => {
      renderer = create(
        <DynamicToast.Provider>
          <DynamicToast.Viewport>
            <DynamicToast.Collapsed>
              <Text>Syncing</Text>
            </DynamicToast.Collapsed>
          </DynamicToast.Viewport>
        </DynamicToast.Provider>,
      );
    });

    const topWrapper = renderer!.root.findAllByType(View).find((node) => {
      const style = StyleSheet.flatten(node.props.style);
      return style?.zIndex === 1000;
    });
    expect(StyleSheet.flatten(topWrapper!.props.style)).toMatchObject({ top: 67 });

    act(() => {
      renderer!.update(
        <DynamicToast.Provider>
          <DynamicToast.Viewport offset={8} placement="bottom">
            <DynamicToast.Collapsed>
              <Text>Syncing</Text>
            </DynamicToast.Collapsed>
          </DynamicToast.Viewport>
        </DynamicToast.Provider>,
      );
    });

    const bottomWrapper = renderer!.root.findAllByType(View).find((node) => {
      const style = StyleSheet.flatten(node.props.style);
      return style?.zIndex === 1000;
    });
    expect(StyleSheet.flatten(bottomWrapper!.props.style)).toMatchObject({ bottom: 42 });
  });

  it('expands on long press and triggers light haptics', () => {
    const haptics = jest.requireMock('expo-haptics') as {
      impactAsync: jest.Mock;
      ImpactFeedbackStyle: { Light: string };
    };
    let toastState: DynamicToastContextValue | undefined;

    function StateProbe() {
      toastState = useDynamicToast();
      return null;
    }

    act(() => {
      renderer = create(
        <DynamicToast.Provider>
          <StateProbe />
          <DynamicToast.Viewport>
            <DynamicToast.Collapsed />
          </DynamicToast.Viewport>
        </DynamicToast.Provider>,
      );
    });

    const toast = renderer!.root.findByProps({ delayLongPress: 200 });

    act(() => toast.props.onLongPress());

    expect(toastState?.state.isExpanded.get()).toBe(true);
    expect(haptics.impactAsync).toHaveBeenCalledWith(haptics.ImpactFeedbackStyle.Light);
  });

  it('uses blur only in the iOS implementation', () => {
    act(() => {
      renderer = create(
        <DynamicToast.Provider>
          <DynamicToast.Viewport>
            <IosCollapsed />
            <IosExpanded />
          </DynamicToast.Viewport>
        </DynamicToast.Provider>,
      );
    });

    expect(
      renderer!.root.findAllByType(View).filter((node) => node.props.testID === 'blur-view'),
    ).toHaveLength(2);

    act(() => {
      renderer!.update(
        <DynamicToast.Provider>
          <DynamicToast.Viewport>
            <AndroidCollapsed />
            <AndroidExpanded />
          </DynamicToast.Viewport>
        </DynamicToast.Provider>,
      );
    });

    expect(
      renderer!.root.findAllByType(View).filter((node) => node.props.testID === 'blur-view'),
    ).toHaveLength(0);
  });

  it('throws when the state hook is used outside the provider', () => {
    function InvalidConsumer() {
      useDynamicToast();
      return null;
    }

    expect(() => {
      act(() => {
        renderer = create(<InvalidConsumer />);
      });
    }).toThrow('useDynamicToast must be used within DynamicToast.Provider');
  });
});
