import { type ReactNode } from 'react';
import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AgentProtocolError } from '@/shared/contracts/agent';

import { deriveContextUsage } from '../../utils/contextUsage';
import { ContextUsageRing } from '../ContextUsageRing';

const mockToastShow = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));
jest.mock('@/frontend/hooks/useThemeColor', () => ({
  useThemeColor: () => ['#888', '#0a0', '#fa0', '#f00'],
}));
jest.mock('react-native-svg', () => {
  const React = jest.requireActual('react');
  return {
    __esModule: true,
    default: ({ children, ...props }: { children?: ReactNode }) =>
      React.createElement('Svg', props, children),
    Circle: (props: object) => React.createElement('Circle', props),
  };
});
jest.mock('../ContextUsageProgress', () => ({
  ContextUsageProgress: (props: object) =>
    jest.requireActual('react').createElement('ContextUsageProgress', props),
}));
jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const { View: RNView } = jest.requireActual('react-native');
  return {
    AnchoredInfoPopover: ({
      anchor,
      children,
      footer,
      ...props
    }: {
      anchor?: object;
      children?: ReactNode;
      footer?: ReactNode;
    }) =>
      React.createElement(
        'AnchoredInfoPopover',
        { ...props, anchor },
        anchor
          ? [
              React.createElement(
                RNView,
                { key: 'children', testID: 'popover-children' },
                children,
              ),
              React.createElement(RNView, { key: 'footer', testID: 'popover-footer' }, footer),
            ]
          : null,
      ),
    Button: Object.assign(
      ({ children, ...props }: { children?: ReactNode }) =>
        React.createElement('Button', props, children),
      {
        Label: ({ children }: { children?: ReactNode }) =>
          React.createElement('ButtonLabel', null, children),
      },
    ),
    Composer: {
      Action: ({ children, ...props }: { children?: ReactNode }) =>
        React.createElement('ComposerAction', props, children),
    },
    useToast: () => ({ toast: { show: mockToastShow } }),
  };
});

describe('ContextUsageRing', () => {
  let renderer: ReactTestRenderer | undefined;
  let originalMeasureInWindow: unknown;
  const viewPrototype = (View as unknown as { prototype: Record<string, unknown> }).prototype;
  const usage = deriveContextUsage(100_000, 82_000)!;

  beforeEach(() => {
    mockToastShow.mockReset();
    originalMeasureInWindow = viewPrototype.measureInWindow;
    viewPrototype.measureInWindow = (cb: (x: number, y: number, w: number, h: number) => void) =>
      cb(10, 20, 30, 40);
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    viewPrototype.measureInWindow = originalMeasureInWindow;
  });

  function openRing(
    onCompact: jest.Mock<Promise<'compacted' | 'unchanged' | 'unavailable'>, []>,
    compactDisabled = false,
  ) {
    act(() => {
      renderer = create(
        <ContextUsageRing
          usage={usage}
          onCompact={onCompact}
          compactDisabled={compactDisabled}
          testID="ring"
        />,
      );
    });
    act(() => {
      renderer!.root.findByType('ComposerAction' as never).props.onPress();
    });
  }

  test('places ContextCompactionButton in AnchoredInfoPopover footer outside children', () => {
    openRing(jest.fn(async () => 'unchanged'));
    const popoverChildren = renderer!.root.findByProps({ testID: 'popover-children' });
    const popoverFooter = renderer!.root.findByProps({ testID: 'popover-footer' });
    expect(popoverChildren.findAllByType('ContextUsageProgress' as never)).toHaveLength(1);
    expect(
      popoverChildren.findAllByProps({ testID: 'chat-compact-context' }, { deep: false }),
    ).toHaveLength(0);
    expect(
      popoverFooter.findAllByProps({ testID: 'chat-compact-context' }, { deep: false }),
    ).toHaveLength(1);
  });

  test('closes the popover and reports success when compacted', async () => {
    const onCompact = jest.fn(async () => 'compacted' as const);
    openRing(onCompact);
    await act(async () => {
      renderer!.root.findByProps({ testID: 'chat-compact-context' }).props.onPress();
    });
    expect(renderer!.root.findByType('AnchoredInfoPopover' as never).props.anchor).toBeUndefined();
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'chat.compaction.compacted_plain',
      variant: 'success',
    });
  });

  test.each([
    ['unchanged', async () => 'unchanged' as const, { label: 'chat.compaction.unchanged' }],
    [
      'unavailable',
      async () => 'unavailable' as const,
      { label: 'chat.compaction.unavailable', variant: 'danger' },
    ],
    [
      'SESSION_BUSY error',
      async () => {
        throw new AgentProtocolError({ code: 'SESSION_BUSY', message: 'busy', retryable: false });
      },
      { label: 'chat.compaction.unavailable' },
    ],
    [
      'unexpected error',
      async () => {
        throw new Error('boom');
      },
      { label: 'chat.compaction.failed', variant: 'danger' },
    ],
  ])('reports manual compaction outcome for %s', async (_label, impl, expectedToast) => {
    const onCompact = jest.fn<Promise<'compacted' | 'unchanged' | 'unavailable'>, []>(impl);
    openRing(onCompact);
    await act(async () => {
      renderer!.root.findByProps({ testID: 'chat-compact-context' }).props.onPress();
    });
    expect(mockToastShow).toHaveBeenCalledWith(expectedToast);
  });

  test('does not show an error toast when compaction is cancelled', async () => {
    const onCompact = jest.fn(async () => {
      throw new AgentProtocolError({ code: 'CANCELLED', message: 'cancelled', retryable: true });
    });
    openRing(onCompact);
    await act(async () => {
      renderer!.root.findByProps({ testID: 'chat-compact-context' }).props.onPress();
    });
    expect(mockToastShow).not.toHaveBeenCalled();
  });
});
