import type { ReactNode } from 'react';
import { Platform, View } from 'react-native';
import type {
  LongPressGesture,
  LongPressGestureConfig,
  NativeGestureConfig,
} from 'react-native-gesture-handler';
import StatefulPressable from 'react-native-gesture-handler/src/v3/components/StatefulPressable';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

// Exercise the installed Pressable and its real state machine. Only the native
// recognizers are replaced, so we can replay UP before the delayed final result.
let mockTouch: LongPressGestureConfig;
let mockButton: NativeGestureConfig;
let mockScreenReaderEnabled = false;

jest.mock('react-native-gesture-handler/src/v3/hooks', () => ({
  useHoverGesture: (config: object) => config,
  useLongPressGesture: (config: LongPressGestureConfig) => {
    mockTouch = config;
    return config;
  },
  useNativeGesture: (config: NativeGestureConfig) => {
    mockButton = config;
    return config;
  },
  useSimultaneousGestures: (...gestures: object[]) => gestures,
}));

jest.mock('react-native-gesture-handler/src/v3/detectors', () => ({
  GestureDetector: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-gesture-handler/src/v3/components/GestureButtons', () => ({
  PureNativeButton: jest.requireActual('react-native').View,
}));

jest.mock('react-native-gesture-handler/src/handlers/PressabilityDebugView', () => ({
  PressabilityDebugView: () => null,
}));

jest.mock('react-native-gesture-handler/src/useIsScreenReaderEnabled', () => ({
  useIsScreenReaderEnabled: () => mockScreenReaderEnabled,
}));

const dependency = { handlerTag: 1 } as LongPressGesture;
const touch = { id: 1, x: 20, y: 20, absoluteX: 20, absoluteY: 20 };
const touchEvent = { allTouches: [touch], changedTouches: [touch], handlerTag: 2 };

describe('Android context-menu Pressable event ordering', () => {
  let renderer: ReactTestRenderer;
  const onPress = jest.fn();
  const onPressIn = jest.fn();
  const onPressOut = jest.fn();

  function mount(withDependency = true) {
    act(() => {
      renderer = create(
        <StatefulPressable
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          requireToFail={withDependency ? dependency : undefined}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          testID="row"
        />,
      );
    });
    act(() => {
      renderer.root.findByType(View).props.onLayout({
        nativeEvent: { layout: { width: 200, height: 48 } },
      });
    });
  }

  function down() {
    act(() => {
      mockButton.onBegin?.({} as never);
      mockTouch.onTouchesDown?.(touchEvent as never);
    });
  }

  function up() {
    act(() => mockTouch.onTouchesUp?.(touchEvent as never));
  }

  function finalize(canceled = false) {
    act(() => mockButton.onFinalize?.({ canceled } as never));
  }

  function opacity() {
    return renderer.root.findByType(View).props.style[1].opacity;
  }

  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockScreenReaderEnabled = false;
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    jest.restoreAllMocks();
  });

  it('keeps pressed feedback and delivers one tap when dependency failure arrives after UP', () => {
    mount();
    down();
    expect(opacity()).toBe(0.5);
    expect(onPressIn).toHaveBeenCalledTimes(1);
    up();
    expect(onPress).not.toHaveBeenCalled();
    finalize();
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPressOut).toHaveBeenCalledTimes(1);
    expect(opacity()).toBe(1);
    finalize();
    up();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each(['before UP', 'after UP'])('does not navigate when long press wins %s', (order) => {
    mount();
    down();
    if (order === 'after UP') up();
    finalize(true);
    if (order === 'before UP') up();
    expect(onPress).not.toHaveBeenCalled();
    expect(opacity()).toBe(1);
    down();
    up();
    finalize();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each(['touch', 'button'])(
    'cancels scrolling through the %s recognizer and rearms',
    (source) => {
      mount();
      down();
      act(() => {
        const recognizer = source === 'touch' ? mockTouch : mockButton;
        recognizer.onTouchesCancel?.(touchEvent as never);
      });
      up();
      finalize();
      expect(onPress).not.toHaveBeenCalled();
      expect(onPressOut).toHaveBeenCalledTimes(1);
      expect(opacity()).toBe(1);
      down();
      up();
      finalize();
      expect(onPress).toHaveBeenCalledTimes(1);
    },
  );

  it('retains the ordinary Android release fallback without a failure dependency', () => {
    mount(false);
    down();
    up();
    finalize();
    expect(onPress).not.toHaveBeenCalled();
    down();
    finalize();
    up();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('retains accessibility activation without touch callbacks', () => {
    mockScreenReaderEnabled = true;
    mount();
    act(() => mockButton.onBegin?.({} as never));
    finalize();
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(opacity()).toBe(1);
  });
});
