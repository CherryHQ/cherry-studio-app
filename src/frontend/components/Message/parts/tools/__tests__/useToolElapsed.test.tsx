import type { ReactNode } from 'react';
import { AppState, type AppStateStatus, Text, View } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { MessageListLiveTailProvider } from '../../../list/MessageListLiveTailContext';
import { ToolGroupPart } from '../ToolGroupPart';
import type { ToolMessagePart } from '../toolPartState';
import { useToolElapsed } from '../useToolElapsed';

let mockOcrState:
  | { status: 'recognizing'; kind: 'image' | 'pdf'; completedPages: number; totalPages: number }
  | undefined;
let mockTranscriptionActivity:
  | { progress?: { completedSeconds: number; totalSeconds: number } }
  | undefined;
let toolGroupRenderCount = 0;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { seconds?: number; count?: number }) =>
      key === 'chat.tool.elapsed'
        ? `Elapsed ${values?.seconds}s`
        : values?.count === undefined
          ? key
          : `${key}:${values.count}`,
  }),
}));

jest.mock('@/frontend/hooks/file', () => ({
  useFileOcrState: () => mockOcrState,
  useAudioTranscriptionActivity: () => mockTranscriptionActivity,
}));

jest.mock('../../../list/MessageListDisclosureContext', () => ({
  useMessageListDisclosureToggle: () => jest.fn(),
}));

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  const { Text: MockText, View: MockView } = jest.requireActual('react-native');
  return {
    MessagePart: {
      ToolGroup: ({
        children,
        statusText,
        title,
      }: {
        children?: ReactNode;
        statusText?: ReactNode;
        title: string;
      }) => {
        toolGroupRenderCount += 1;
        return createElement(
          MockView,
          { testID: 'tool-group' },
          createElement(MockText, { testID: 'tool-group-title' }, title),
          statusText ? createElement(MockText, { testID: 'tool-group-status' }, statusText) : null,
          children,
        );
      },
    },
  };
});

function ElapsedProbe({
  startedAt,
  isRunning,
}: {
  startedAt: number | undefined;
  isRunning: boolean;
}) {
  const label = useToolElapsed(startedAt, isRunning);
  return <Text testID="elapsed-label">{label ?? ''}</Text>;
}

describe('useToolElapsed', () => {
  let renderer: ReactTestRenderer | undefined;
  let originalAppState: typeof AppState.currentState;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(10_000);
    mockOcrState = undefined;
    mockTranscriptionActivity = undefined;
    toolGroupRenderCount = 0;
    originalAppState = AppState.currentState;
    AppState.currentState = 'active';
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    AppState.currentState = originalAppState;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('ticks smoothly every second and aligns sub-second start offsets to 1-second boundaries', () => {
    jest.setSystemTime(10_600);
    act(() => {
      renderer = create(<ElapsedProbe startedAt={10_000} isRunning />);
    });

    const readText = () => renderer!.root.findByProps({ testID: 'elapsed-label' }).props.children;
    expect(readText()).toBe('Elapsed 0s');

    act(() => {
      jest.advanceTimersByTime(399);
    });
    expect(readText()).toBe('Elapsed 0s');

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(readText()).toBe('Elapsed 1s');

    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(readText()).toBe('Elapsed 2s');

    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(readText()).toBe('Elapsed 3s');
  });

  it('pauses ticks while scrolled away from the live tail and catches up on return', () => {
    const draw = (isVisible: boolean) => (
      <MessageListLiveTailProvider isVisible={isVisible}>
        <ElapsedProbe startedAt={10_000} isRunning />
      </MessageListLiveTailProvider>
    );

    act(() => {
      renderer = create(draw(true));
    });
    const readText = () => renderer!.root.findByProps({ testID: 'elapsed-label' }).props.children;
    expect(readText()).toBe('Elapsed 0s');

    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(readText()).toBe('Elapsed 1s');

    act(() => {
      renderer!.update(draw(false));
    });
    expect(jest.getTimerCount()).toBe(0);

    act(() => {
      jest.advanceTimersByTime(4_300);
    });
    expect(readText()).toBe('Elapsed 1s');

    act(() => {
      renderer!.update(draw(true));
    });
    expect(readText()).toBe('Elapsed 5s');

    act(() => {
      jest.advanceTimersByTime(700);
    });
    expect(readText()).toBe('Elapsed 6s');
  });

  it('pauses ticks in the background and catches up when AppState becomes active', () => {
    let appStateListener: ((state: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });

    act(() => {
      renderer = create(<ElapsedProbe startedAt={10_000} isRunning />);
    });
    const readText = () => renderer!.root.findByProps({ testID: 'elapsed-label' }).props.children;
    expect(readText()).toBe('Elapsed 0s');

    act(() => {
      AppState.currentState = 'background';
      appStateListener?.('background');
    });
    expect(jest.getTimerCount()).toBe(0);

    act(() => {
      jest.advanceTimersByTime(3_400);
    });
    expect(readText()).toBe('Elapsed 0s');

    act(() => {
      AppState.currentState = 'active';
      appStateListener?.('active');
    });
    expect(readText()).toBe('Elapsed 3s');

    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(readText()).toBe('Elapsed 4s');
  });

  it('returns undefined and schedules no timers when stopped or missing a valid startedAt', () => {
    act(() => {
      renderer = create(<ElapsedProbe startedAt={10_000} isRunning={false} />);
    });
    expect(renderer!.root.findByProps({ testID: 'elapsed-label' }).props.children).toBe('');
    expect(jest.getTimerCount()).toBe(0);

    act(() => {
      renderer!.update(<ElapsedProbe startedAt={undefined} isRunning />);
    });
    expect(renderer!.root.findByProps({ testID: 'elapsed-label' }).props.children).toBe('');
    expect(jest.getTimerCount()).toBe(0);

    act(() => {
      renderer!.update(<ElapsedProbe startedAt={Number.NaN} isRunning />);
    });
    expect(renderer!.root.findByProps({ testID: 'elapsed-label' }).props.children).toBe('');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('isolates 1-second updates in the ToolGroupPart leaf and skips timers when status is overridden', () => {
    const runningTool: ToolMessagePart = {
      type: 'dynamic-tool',
      toolName: 'read_file',
      toolCallId: 'call-1',
      input: {},
      state: 'input-available',
    };
    const draw = (tools: readonly ToolMessagePart[]) => (
      <ToolGroupPart
        expanded={false}
        isStreaming
        isThinking={false}
        onExpandedChange={jest.fn()}
        startedAt={10_000}
        tools={tools}
      >
        <View testID="step-child" />
      </ToolGroupPart>
    );

    act(() => {
      renderer = create(draw([runningTool]));
    });
    const readRenderedText = (node: ReactTestInstance | string): string =>
      typeof node === 'string' ? node : node.children.map(readRenderedText).join('');
    const readStatusText = () =>
      readRenderedText(renderer!.root.findByProps({ testID: 'tool-group-status' }));

    expect(toolGroupRenderCount).toBe(1);
    expect(readStatusText()).toBe('Elapsed 0s');

    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(readStatusText()).toBe('Elapsed 1s');
    expect(toolGroupRenderCount).toBe(1);

    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(readStatusText()).toBe('Elapsed 3s');
    expect(toolGroupRenderCount).toBe(1);

    mockOcrState = {
      status: 'recognizing',
      kind: 'pdf',
      completedPages: 1,
      totalPages: 4,
    };
    act(() => {
      renderer!.update(draw([runningTool]));
    });
    expect(readStatusText()).toBe('chat.builtinTool.file.recognizing');
    expect(jest.getTimerCount()).toBe(0);

    mockOcrState = undefined;
    const approvalTool: ToolMessagePart = {
      type: 'dynamic-tool',
      toolName: 'read_file',
      toolCallId: 'call-2',
      input: {},
      state: 'approval-requested',
      approval: { id: 'approval-1' },
    };
    act(() => {
      renderer!.update(draw([approvalTool]));
    });
    expect(readStatusText()).toBe('chat.toolGroup.approvalCount:1');
    expect(jest.getTimerCount()).toBe(0);
  });
});
