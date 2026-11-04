import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AgentReadReasoningInput } from '@/shared/contracts/agent';
import type { CherryMessagePart } from '@/shared/data/types/message';

import { MessageListLiveTailProvider } from '../../list/MessageListLiveTailContext';
import { ReasoningDetailProvider, ReasoningPart } from '../ReasoningPart';

const mockReadReasoning = jest.fn();
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({ readReasoning: mockReadReasoning }),
  queryKeys: { agentSessions: { messages: (id: string) => [`/agent-sessions/${id}/messages`] } },
}));
jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  return {
    BackgroundPressArea: ({ children, ...props }: { children: ReactNode }) =>
      React.createElement('ReasoningPreview', props, children),
    ContentState: {
      Loading: (props: object) => React.createElement('LoadingState', props),
      Error: (props: object) => React.createElement('ErrorState', props),
    },
    MessagePart: {
      Detail: ({ children, ...props }: { children: ReactNode }) =>
        React.createElement('ReasoningDetail', props, children),
      TextBody: (props: object) => React.createElement('ReasoningPreviewText', props),
      ToolGroup: ({ children, ...props }: { children: ReactNode }) => {
        const [open, setOpen] = React.useState(false);
        return React.createElement(
          'Reasoning',
          { ...props, onPress: () => setOpen((value: boolean) => !value) },
          open ? children : null,
        );
      },
    },
  };
});
jest.mock('@/frontend/components/MarkdownText', () => ({
  MarkdownText: (props: object) => jest.requireActual('react').createElement('MarkdownText', props),
}));

type ReasoningMessagePart = Extract<CherryMessagePart, { type: 'reasoning' }>;
const longReasoning = '# Thinking\n\n' + 'Earlier content must remain readable 😀.\n'.repeat(250);
const source = { sessionId: 'session', messageId: 'message', partId: 'phase' };

describe('ReasoningPart', () => {
  let renderer: ReactTestRenderer | undefined;
  let client: QueryClient;

  beforeEach(() => {
    jest.useFakeTimers();
    mockReadReasoning.mockReset();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    client.clear();
    jest.useRealTimers();
  });

  function mount(content: ReactNode) {
    const element = <QueryClientProvider client={client}>{content}</QueryClientProvider>;
    act(() => {
      if (renderer) renderer.update(element);
      else renderer = create(element);
    });
  }
  function render(
    text: string,
    isStreaming = false,
    isVisible = true,
    origin?: AgentReadReasoningInput,
  ) {
    const part: ReasoningMessagePart = {
      type: 'reasoning',
      text,
      state: isStreaming ? 'streaming' : 'done',
      ...(origin ? { providerMetadata: { cherry: { hasText: true } } } : {}),
    };
    mount(
      <MessageListLiveTailProvider isVisible={isVisible}>
        <ReasoningPart isStreaming={isStreaming} part={part} source={origin} />
      </MessageListLiveTailProvider>,
    );
  }
  const open = () => act(() => renderer!.root.findByType('Reasoning' as never).props.onPress());
  const openDetail = () =>
    act(() => renderer!.root.findByType('ReasoningPreview' as never).props.onPress());
  const close = () =>
    act(() => renderer!.root.findByType('ReasoningDetail' as never).props.onClose());
  const shown = () => renderer!.root.findByType('MarkdownText' as never).props.markdown as string;
  const previewed = () =>
    renderer!.root.findByType('ReasoningPreviewText' as never).props.value as string;
  const flush = () =>
    act(async () => {
      await jest.advanceTimersByTimeAsync(20);
    });

  test('ends thinking feedback when the reply stops before its part state is finalized', () => {
    const part: ReasoningMessagePart = { type: 'reasoning', state: 'streaming', text: 'Thinking' };
    mount(<ReasoningPart isStreaming part={part} />);
    expect(renderer!.root.findByType('Reasoning' as never).props.state).toBe('running');
    mount(<ReasoningPart isStreaming={false} part={part} />);
    expect(renderer!.root.findByType('Reasoning' as never).props.state).toBe('complete');
  });

  test('expands a plain-text window and opens full Markdown only when the window is tapped', () => {
    render(longReasoning.slice(0, 8000), true);
    expect(renderer!.root.findAllByType('MarkdownText' as never)).toHaveLength(0);
    open();
    expect(previewed()).toBe(longReasoning.slice(0, 8000));
    expect(renderer!.root.findByType('ReasoningPreviewText' as never).props.variant).toBe(
      'preview',
    );
    expect(renderer!.root.findAllByType('MarkdownText' as never)).toHaveLength(0);
    openDetail();
    const markdown = renderer!.root.findByType('MarkdownText' as never);
    render(longReasoning, true);
    expect(shown()).toBe(longReasoning);
    expect(renderer!.root.findByType('MarkdownText' as never)).toBe(markdown);
    render(longReasoning, false);
    expect(markdown.props.isStreaming).toBe(false);
    expect(shown()).toBe(longReasoning);
  });

  test('updates the open sheet even when the chat live tail is off screen and reopens current text', () => {
    render(longReasoning, true, false);
    open();
    openDetail();
    render(longReasoning + 'More thought', true, false);
    expect(shown()).toBe(longReasoning + 'More thought');
    close();
    expect(renderer!.root.findAllByType('MarkdownText' as never)).toHaveLength(0);
    render(longReasoning + 'Final thought');
    openDetail();
    expect(shown()).toBe(longReasoning + 'Final thought');
  });

  test('reads local text only while expanded and stops polling after collapse', async () => {
    mockReadReasoning.mockResolvedValue({ text: longReasoning, state: 'streaming' });
    render('', true, true, source);
    expect(mockReadReasoning).not.toHaveBeenCalled();
    open();
    await flush();
    expect(mockReadReasoning).toHaveBeenCalledWith(source);
    expect(previewed()).toBe(longReasoning);
    expect(renderer!.root.findAllByType('MarkdownText' as never)).toHaveLength(0);
    open();
    const calls = mockReadReasoning.mock.calls.length;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2500);
    });
    expect(mockReadReasoning).toHaveBeenCalledTimes(calls);
  });

  test('keeps an open reader when a streamed part commits and its process folds', async () => {
    const view = (partId: string, streaming: boolean) => {
      const part: ReasoningMessagePart = {
        type: 'reasoning',
        text: '',
        providerMetadata: { cherry: { hasText: true } },
        state: streaming ? 'streaming' : 'done',
      };
      return (
        <ReasoningDetailProvider
          items={[{ key: partId, part }]}
          message={{
            id: 'message',
            agentSessionId: 'session',
            role: 'assistant',
            status: streaming ? 'pending' : 'success',
            data: { parts: [part] },
          }}
        >
          {streaming ? (
            <ReasoningPart isStreaming part={part} partId={partId} source={{ ...source, partId }} />
          ) : null}
        </ReasoningDetailProvider>
      );
    };
    mockReadReasoning.mockResolvedValue({ text: longReasoning, state: 'streaming' });
    mount(view('pi:live:phase', true));
    open();
    openDetail();
    await flush();
    const sheet = renderer!.root.findByType('ReasoningDetail' as never);
    const markdown = renderer!.root.findByType('MarkdownText' as never);
    mockReadReasoning.mockResolvedValue({ text: longReasoning + 'Conclusion', state: 'done' });
    mount(view('pi:committed:phase', false));
    expect(renderer!.root.findByType('ReasoningDetail' as never)).toBe(sheet);
    await flush();
    expect(renderer!.root.findByType('MarkdownText' as never)).toBe(markdown);
    expect(shown()).toBe(longReasoning + 'Conclusion');
    expect(mockReadReasoning).toHaveBeenLastCalledWith({ ...source, partId: 'pi:committed:phase' });
  });

  test('shows a retryable read error inside an expanded status-only phase', async () => {
    mockReadReasoning.mockRejectedValueOnce(new Error('Unavailable'));
    render('', false, true, source);
    open();
    await flush();
    expect(renderer!.root.findAllByType('MarkdownText' as never)).toHaveLength(0);
    mockReadReasoning.mockResolvedValue({ text: longReasoning, state: 'done' });
    act(() => renderer!.root.findByType('ErrorState' as never).props.primaryAction.onPress());
    await flush();
    expect(previewed()).toBe(longReasoning);
  });
});
