import { ScrollView, StyleSheet, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PaintingAssistantMessage } from '../PaintingAssistantMessage';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@cherrystudio/ui/components', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { ImageGenerationLoader: (props: { testID?: string }) => <MockView {...props} /> };
});

let mockReducedMotion = false;
let finishFade: ((finished: boolean) => void) | undefined;

jest.mock('react-native-reanimated', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    __esModule: true,
    cancelAnimation: jest.fn(),
    default: { View: MockView },
    Easing: {
      bezier: () => jest.fn(),
      linear: jest.fn(),
    },
    ReduceMotion: { System: 'system' },
    useAnimatedStyle: (factory: () => object) => factory(),
    useReducedMotion: () => mockReducedMotion,
    useSharedValue: (initial: number) => {
      const { useState } = jest.requireActual('react');
      return useState(() => {
        let value = initial;
        return {
          get: () => value,
          set: (next: number) => {
            value = next;
          },
          get value() {
            return value;
          },
        };
      })[0];
    },
    withTiming: (_value: number, _config: object, callback?: (finished: boolean) => void) => {
      finishFade = callback;
      return 1;
    },
  };
});

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (callback: (...args: unknown[]) => void, ...args: unknown[]) => callback(...args),
}));

jest.mock('@cherrystudio/app-icons', () => ({
  CircleAlertIcon: () => null,
}));

jest.mock('@/frontend/components/nativePrimitives', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { Image: (props: { testID?: string }) => <MockView {...props} /> };
});

jest.mock('@/frontend/components/navigation', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    PaintingZoomLink: ({ children, ...props }: { children: React.ReactNode }) => (
      <MockView {...props} testID="painting-zoom-link">
        {children}
      </MockView>
    ),
  };
});

describe('PaintingAssistantMessage', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    finishFade = undefined;
    mockReducedMotion = false;
  });

  it.each([
    ['portrait', 3 / 4, 240, 320],
    ['landscape', 1664 / 928, 320, 320 / (1664 / 928)],
  ] as const)(
    'sizes the %s loader from the available width',
    (_name, aspectRatio, width, height) => {
      act(() => {
        renderer = create(
          <PaintingAssistantMessage
            aspectRatio={aspectRatio}
            error={null}
            interruption={null}
            resolution={'1664 \u00d7 928'}
            status="generating"
          />,
        );
      });

      const measurement = renderer!.root.find((node) => typeof node.props.onLayout === 'function');
      act(() => {
        measurement.props.onLayout({ nativeEvent: { layout: { height: 0, width } } });
      });
      const loader = renderer!.root.findByProps({ testID: 'painting-generation-loader' });

      expect(loader.props).toMatchObject({
        height,
        label: 'painting.status.generating',
        resolution: '1664 \u00d7 928',
        width,
      });
      expect(loader.props.prompt).toBeUndefined();
    },
  );

  it('renders a bordered result linked to the painting viewer', () => {
    act(() => {
      renderer = create(
        <PaintingAssistantMessage
          aspectRatio={16 / 9}
          error={null}
          interruption={null}
          output={{ fileEntryId: 'output-1', uri: 'file:///output.png' }}
          paintingId="painting-1"
          resolution={'1664 \u00d7 928'}
          status="idle"
        />,
      );
    });

    const link = renderer!.root.findByProps({ testID: 'painting-zoom-link' });
    const frame = renderer!.root.find(
      (node) => StyleSheet.flatten(node.props.style)?.aspectRatio === 16 / 9,
    );
    const border = renderer!.root.find(
      (node) =>
        node.props.pointerEvents === 'none' &&
        node.props.className?.includes('border border-border'),
    );

    expect(link.props).toMatchObject({ fileEntryId: 'output-1', paintingId: 'painting-1' });
    expect(StyleSheet.flatten(frame.props.style)?.aspectRatio).toBeCloseTo(16 / 9);
    expect(border.props.className).toContain('absolute inset-0');
    expect(renderer!.root.findAllByProps({ testID: 'painting-generation-loader' })).toHaveLength(0);
    expect(renderer!.root.findAllByType(ScrollView)).toHaveLength(0);
  });

  it('keeps the stopped loader under a live result until the image fades in', () => {
    act(() => {
      renderer = create(
        <PaintingAssistantMessage
          animateOutput
          aspectRatio={16 / 9}
          error={null}
          interruption={null}
          resolution={'1664 \u00d7 928'}
          status="generating"
        />,
      );
    });
    const measurement = renderer!.root.find((node) => typeof node.props.onLayout === 'function');
    act(() => {
      measurement.props.onLayout({ nativeEvent: { layout: { height: 0, width: 320 } } });
    });

    act(() => {
      renderer?.update(
        <PaintingAssistantMessage
          animateOutput
          aspectRatio={16 / 9}
          error={null}
          interruption={null}
          output={{ fileEntryId: 'output-1', uri: 'file:///output.png' }}
          paintingId="painting-1"
          resolution={'1664 \u00d7 928'}
          status="idle"
        />,
      );
    });

    expect(renderer!.root.findByProps({ testID: 'painting-generation-loader' }).props.active).toBe(
      false,
    );
    const image = renderer!.root.findByProps({ testID: 'painting-result-image' });
    expect(image.props.transition).toBeUndefined();
    expect(
      renderer!.root.findByProps({ testID: 'painting-output-output-1' }).props.pointerEvents,
    ).toBe('none');

    act(() => image.props.onDisplay());
    expect(renderer!.root.findByProps({ testID: 'painting-generation-loader' })).toBeDefined();

    act(() => finishFade?.(true));
    expect(renderer!.root.findAllByProps({ testID: 'painting-generation-loader' })).toHaveLength(0);
    expect(
      renderer!.root.findByProps({ testID: 'painting-output-output-1' }).props.pointerEvents,
    ).toBe('auto');
  });

  it('finishes a live result immediately after display when motion is reduced', () => {
    mockReducedMotion = true;
    act(() => {
      renderer = create(
        <PaintingAssistantMessage
          animateOutput
          aspectRatio={1}
          error={null}
          interruption={null}
          resolution={'1024 \u00d7 1024'}
          status="generating"
        />,
      );
    });
    const measurement = renderer!.root.find((node) => typeof node.props.onLayout === 'function');
    act(() => {
      measurement.props.onLayout({ nativeEvent: { layout: { height: 0, width: 320 } } });
      renderer?.update(
        <PaintingAssistantMessage
          animateOutput
          aspectRatio={1}
          error={null}
          interruption={null}
          output={{ fileEntryId: 'output-1', uri: 'file:///output.png' }}
          paintingId="painting-1"
          resolution={'1024 \u00d7 1024'}
          status="idle"
        />,
      );
    });

    act(() => renderer!.root.findByProps({ testID: 'painting-result-image' }).props.onDisplay());
    expect(renderer!.root.findAllByProps({ testID: 'painting-generation-loader' })).toHaveLength(0);
  });

  it('does not leave the stopped loader visible when the result image fails to display', () => {
    act(() => {
      renderer = create(
        <PaintingAssistantMessage
          animateOutput
          aspectRatio={1}
          error={null}
          interruption={null}
          resolution={'1024 \u00d7 1024'}
          status="generating"
        />,
      );
    });
    const measurement = renderer!.root.find((node) => typeof node.props.onLayout === 'function');
    act(() => {
      measurement.props.onLayout({ nativeEvent: { layout: { height: 0, width: 320 } } });
      renderer?.update(
        <PaintingAssistantMessage
          animateOutput
          aspectRatio={1}
          error={null}
          interruption={null}
          output={{ fileEntryId: 'output-1', uri: 'file:///missing.png' }}
          paintingId="painting-1"
          resolution={'1024 \u00d7 1024'}
          status="idle"
        />,
      );
    });

    act(() => renderer!.root.findByProps({ testID: 'painting-result-image' }).props.onError());
    expect(renderer!.root.findAllByProps({ testID: 'painting-generation-loader' })).toHaveLength(0);
  });

  it('shows an assistant error without a retry control', () => {
    act(() => {
      renderer = create(
        <PaintingAssistantMessage
          aspectRatio={1}
          error={new Error('provider unavailable')}
          interruption={null}
          resolution={'1024 \u00d7 1024'}
          status="idle"
        />,
      );
    });

    expect(renderer!.root.findByProps({ accessibilityRole: 'alert' }).props.children).toBe(
      'painting.status.failed',
    );
    expect(renderer!.root.findAllByType(View)).toBeDefined();
  });
});
