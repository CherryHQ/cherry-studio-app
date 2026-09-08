import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PaintingAssistantMessage } from '../PaintingAssistantMessage';

jest.mock('@cherrystudio/app-icons/icons/circle-alert', () => {
  const { View } = jest.requireActual('react-native');
  return function MockCircleAlertIcon(props: object) {
    return <View {...props} testID="painting-status-icon" />;
  };
});

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const { Pressable, Text: MockText, View } = jest.requireActual('react-native');

  function MockButton({ children, ...props }: { children?: ReactNode }) {
    return React.createElement(Pressable, props, children);
  }

  return {
    Button: Object.assign(MockButton, {
      Label: ({ children }: { children?: ReactNode }) =>
        React.createElement(MockText, null, children),
    }),
    Image: (props: object) => React.createElement(View, props),
    ImageGenerationLoader: (props: object) => React.createElement(View, props),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));

jest.mock('react-native-reanimated', () => {
  const { useState } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    __esModule: true,
    cancelAnimation: jest.fn(),
    default: { View },
    Easing: { bezier: () => 'bezier', linear: 'linear' },
    ReduceMotion: { System: 'system' },
    useAnimatedStyle: (factory: () => object) => factory(),
    useReducedMotion: () => true,
    useSharedValue: (initial: number) => {
      const [sharedValue] = useState(() => {
        let value = initial;
        return {
          get: () => value,
          set: (next: number) => {
            value = next;
          },
        };
      });
      return sharedValue;
    },
    withTiming: (value: number) => value,
  };
});

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (callback: () => void) => callback(),
}));

jest.mock('@/frontend/components/ArtifactPreview', () => ({
  ArtifactPreviewLink: ({ children }: { children: ReactNode }) => children,
}));

describe('PaintingAssistantMessage', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  it('shows localized recovery copy and retries without exposing provider diagnostics', () => {
    const onRetry = jest.fn();
    act(() => {
      renderer = create(
        <PaintingAssistantMessage
          aspectRatio={1}
          error={new Error('Invalid JSON response from provider')}
          interruption={null}
          onRetry={onRetry}
          outputs={[]}
          prompt="Draw a cherry"
          resolution="Auto"
          status="idle"
        />,
      );
    });

    const text = renderer?.root.findAllByType(Text).map((node) => node.props.children);
    expect(text).toContain('painting.status.failed');
    expect(text).toContain('painting.status.failedHint');
    expect(text).not.toContain('Invalid JSON response from provider');
    expect(
      renderer?.root.findByProps({ testID: 'painting-status-icon' }).props.className,
    ).toContain('text-error');

    const retry = renderer?.root.findByProps({ accessibilityLabel: 'painting.status.retry' });
    act(() => retry?.props.onPress());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('uses warning feedback for an interrupted generation', () => {
    act(() => {
      renderer = create(
        <PaintingAssistantMessage
          aspectRatio={1}
          error={null}
          interruption={{ reason: 'interrupted' }}
          outputs={[]}
          prompt="Draw a cherry"
          resolution="Auto"
          status="idle"
        />,
      );
    });

    expect(
      renderer?.root.findByProps({ testID: 'painting-status-icon' }).props.className,
    ).toContain('text-warning');
  });

  it('distinguishes multiple generated outputs for assistive technology', () => {
    act(() => {
      renderer = create(
        <PaintingAssistantMessage
          aspectRatio={1}
          error={null}
          interruption={null}
          outputs={[
            { fileEntryId: 'output-1', uri: 'file:///one.png' },
            { fileEntryId: 'output-2', uri: 'file:///two.png' },
          ]}
          paintingId="painting-1"
          prompt="Draw a cherry"
          resolution="1024 x 1024"
          status="idle"
        />,
      );
    });

    const outputLabels = new Set(
      renderer?.root
        .findAllByProps({ accessibilityRole: 'button' })
        .map((node) => node.props.accessibilityLabel),
    );
    expect(outputLabels).toEqual(
      new Set([
        'painting.outputAccessibility:{"count":2,"index":1,"prompt":"Draw a cherry"}',
        'painting.outputAccessibility:{"count":2,"index":2,"prompt":"Draw a cherry"}',
      ]),
    );
  });

  it('makes the result visible when persisted files end its fade before the image displays', () => {
    const props = {
      aspectRatio: 1,
      error: null,
      interruption: null,
      paintingId: 'painting-1',
      prompt: 'Draw a cherry',
      resolution: '1024 x 1024',
    };
    const outputs = [{ fileEntryId: 'output-1', uri: 'file:///one.png' }];
    act(() => {
      renderer = create(<PaintingAssistantMessage {...props} outputs={[]} status="generating" />);
    });
    act(() => {
      renderer?.update(
        <PaintingAssistantMessage {...props} animateOutput outputs={outputs} status="idle" />,
      );
    });
    expect(renderer?.root.findByProps({ testID: 'painting-results' }).props.style).toEqual({
      opacity: 0,
    });

    // Query synchronization can turn off the fade before the native onDisplay event.
    act(() => {
      renderer?.update(
        <PaintingAssistantMessage
          {...props}
          animateOutput={false}
          outputs={outputs}
          status="idle"
        />,
      );
    });
    expect(renderer?.root.findByProps({ testID: 'painting-results' }).props.style).toEqual({
      opacity: 1,
    });
    expect(
      renderer?.root.findByProps({ testID: 'painting-output-output-1' }).props.pointerEvents,
    ).toBe('auto');
    expect(renderer?.root.findAllByProps({ testID: 'painting-generation-loader' })).toHaveLength(0);
  });
});
