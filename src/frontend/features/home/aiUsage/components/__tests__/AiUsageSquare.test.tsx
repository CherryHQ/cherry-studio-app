import { type RefObject, createRef } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import type { AiUsageAnimationControls } from '../../types';
import { AiUsageSquare } from '../AiUsageSquare';

jest.mock('react-native-reanimated', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    __esModule: true,
    cancelAnimation: jest.fn(),
    default: { View: MockView },
    Extrapolation: { CLAMP: 'clamp' },
    interpolate: (value: number, _input: number[], output: number[]) =>
      value <= 0 ? output[0] : output.at(-1),
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: () => {
      let value = 0;
      return {
        get: () => value,
        set: (nextValue: number) => {
          value = nextValue;
        },
      };
    },
    withDelay: (_delay: number, value: number) => value,
    withSpring: (value: number) => value,
  };
});

describe('AiUsageSquare', () => {
  let controlsRef: RefObject<AiUsageAnimationControls | null>;
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    controlsRef = createRef<AiUsageAnimationControls>();
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('keeps colors static while animating only transform and opacity', async () => {
    await act(async () => {
      renderer = create(
        <AiUsageSquare
          cellSize={12}
          dayIndex={2}
          isHighlighted
          level={3}
          levelColors={['#base', '#one', '#two', '#active', '#four']}
          ref={controlsRef}
          weekIndex={4}
        />,
      );
    });

    const activeLayer = renderer?.root.findByProps({ testID: 'ai-usage-square-active-layer' });
    const container = (activeLayer as unknown as { parent?: ReactTestInstance }).parent;
    const containerStyle = StyleSheet.flatten(container?.props.style);
    const activeStyle = StyleSheet.flatten(activeLayer?.props.style);

    expect(containerStyle).toEqual(
      expect.objectContaining({
        backgroundColor: '#base',
        height: 12,
        transform: [{ scale: 1 }],
        width: 12,
      }),
    );
    expect(activeStyle).toEqual(
      expect.objectContaining({ backgroundColor: '#active', opacity: 0 }),
    );
    expect(controlsRef.current?.replayAnimation).toEqual(expect.any(Function));
  });
});
