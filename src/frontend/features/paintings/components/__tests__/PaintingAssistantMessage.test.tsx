import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PaintingAssistantMessage } from '../PaintingAssistantMessage';

jest.mock('@cherrystudio/app-icons/icons/circle-alert', () => () => null);

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
  const { View } = jest.requireActual('react-native');

  return {
    __esModule: true,
    cancelAnimation: jest.fn(),
    default: { View },
    ReduceMotion: { System: 'system' },
    useAnimatedStyle: (factory: () => object) => factory(),
    useReducedMotion: () => true,
    useSharedValue: (initial: number) => {
      let value = initial;
      return {
        get: () => value,
        set: (next: number) => {
          value = next;
        },
      };
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

    const retry = renderer?.root.findByProps({ accessibilityLabel: 'painting.status.retry' });
    act(() => retry?.props.onPress());
    expect(onRetry).toHaveBeenCalledTimes(1);
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

    expect(
      renderer?.root
        .findAllByProps({ accessibilityRole: 'button' })
        .map((node) => node.props.accessibilityLabel),
    ).toEqual([
      'painting.outputAccessibility:{"count":2,"index":1,"prompt":"Draw a cherry"}',
      'painting.outputAccessibility:{"count":2,"index":2,"prompt":"Draw a cherry"}',
    ]);
  });
});
