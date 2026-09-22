import type { GestureResponderEvent } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ScrollInteractionBoundary } from '../../scroll-interaction/scroll-interaction-boundary';
import type { ScrollInteractionHandlers } from '../../scroll-interaction/scroll-interaction-boundary.types';
import { BackgroundPressArea, BackgroundPressExclusion } from '../background-press';

jest.mock('../background-press-adapter', () => ({
  BackgroundPressAdapter: ({ children, ...props }: { children?: React.ReactNode }) =>
    jest.requireActual('react').createElement('NativeBackgroundPress', props, children),
}));

describe('background press boundary', () => {
  let renderer: ReactTestRenderer | undefined;
  let scrollHandlers: ScrollInteractionHandlers;
  const onPress = jest.fn();
  const onTouchStart = jest.fn();
  const onMomentumEnd = jest.fn();
  const touch = { nativeEvent: {} } as GestureResponderEvent;

  function Harness({
    disabled = false,
    showScroll = true,
  }: {
    disabled?: boolean;
    showScroll?: boolean;
  }) {
    return (
      <BackgroundPressArea disabled={disabled} onPress={onPress} onTouchStart={onTouchStart}>
        {showScroll ? (
          <ScrollInteractionBoundary onMomentumScrollEnd={onMomentumEnd}>
            {(handlers) => {
              scrollHandlers = handlers;
              return <BackgroundPressExclusion />;
            }}
          </ScrollInteractionBoundary>
        ) : null}
      </BackgroundPressArea>
    );
  }

  const area = () => renderer!.root.findAllByType('NativeBackgroundPress')[0];
  const excluded = () => renderer!.root.findAllByType('NativeBackgroundPress')[1];

  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      renderer = create(<Harness />);
    });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
  });

  test('stopping list momentum does not dismiss, but a subsequent background tap does', () => {
    const event = {} as Parameters<
      NonNullable<ScrollInteractionHandlers['onMomentumScrollBegin']>
    >[0];
    act(() => {
      scrollHandlers.onMomentumScrollBegin?.(event);
      area().props.onBackgroundTouchStart(touch.nativeEvent);
      scrollHandlers.onMomentumScrollEnd?.(event);
      area().props.onBackgroundPress();
    });
    expect(onMomentumEnd).toHaveBeenCalledWith(event);
    expect(onPress).not.toHaveBeenCalled();

    act(() => {
      area().props.onBackgroundTouchStart(touch.nativeEvent);
      area().props.onBackgroundPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('bubbling child touches are excluded before the parent considers the tap', () => {
    act(() => {
      excluded().props.onTouchStart(touch);
      area().props.onBackgroundTouchStart(touch.nativeEvent);
      area().props.onBackgroundPress();
    });
    expect(onPress).not.toHaveBeenCalled();
  });

  test('ignores a native completion after the area is disabled', () => {
    act(() => area().props.onBackgroundTouchStart(touch.nativeEvent));
    act(() => renderer!.update(<Harness disabled />));
    act(() => area().props.onBackgroundPress());
    expect(onPress).not.toHaveBeenCalled();
  });

  test('a late RN touch event cannot reject or rearm the native tap', () => {
    act(() => {
      area().props.onBackgroundTouchStart(touch.nativeEvent);
      area().props.onBackgroundPress();
      // Nitro completion can precede RN's batched touch-start delivery.
      area().props.onTouchStart(touch);
      scrollHandlers.onTouchStart?.(touch);
      area().props.onBackgroundPress();
    });
    expect(onTouchStart).toHaveBeenCalledWith(touch);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('unmounting a scrolling surface releases its subscription without accepting the old touch', () => {
    const event = {} as Parameters<
      NonNullable<ScrollInteractionHandlers['onMomentumScrollBegin']>
    >[0];
    act(() => {
      scrollHandlers.onMomentumScrollBegin?.(event);
      area().props.onBackgroundTouchStart(touch.nativeEvent);
    });
    const staleHandlers = scrollHandlers;
    act(() => renderer!.update(<Harness showScroll={false} />));
    act(() => area().props.onBackgroundPress());
    expect(onPress).not.toHaveBeenCalled();

    act(() => {
      area().props.onBackgroundTouchStart(touch.nativeEvent);
      staleHandlers.onScrollBeginDrag?.(event);
      area().props.onBackgroundPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
