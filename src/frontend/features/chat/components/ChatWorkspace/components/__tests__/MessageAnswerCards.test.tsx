import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '@/frontend/components/Message';

import { ExpandAnswerContextProvider } from '../../context/ExpandAnswerContext';
import { MessageAnswerCards } from '../MessageAnswerCards';

const mockSelectBranch = jest.fn();
const mockExpand = jest.fn();
let mockQuoteSupported = false;
jest.mock('../../../../quotes/ChatQuoteContext', () => ({
  useChatQuoteActions: () =>
    mockQuoteSupported
      ? { canReply: (message: MessageListItem) => message.status === 'success' }
      : undefined,
}));
let mockActions: Record<string, jest.Mock | undefined> = {};
let mockAnswers = new Map<string, MessageListItem>();

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    ContextMenu: ({ children, ...props }: { children: ReactNode }) =>
      createElement('ContextMenu', props, children),
    ContextMenuExclusion: ({ children }: { children: ReactNode }) => children,
    BackgroundPressExclusion: ({ children }: { children: ReactNode }) => children,
    ShimmerText: (props: object) => createElement('ShimmerText', props),
    Skeleton: () => createElement('Skeleton'),
    Spinner: () => createElement('Spinner'),
  };
});

jest.mock('@cherrystudio/ui/utils', () => ({ cn: (...names: unknown[]) => names.join(' ') }));

jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));

jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));

jest.mock('@/frontend/hooks/useThemeColor', () => ({ useThemeColor: () => 'black' }));
jest.mock('uniwind', () => ({
  useResolveClassNames: () => ({ backgroundColor: 'rgba(0, 0, 0, 0)' }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}));

jest.mock('@/frontend/components/Avatar', () => ({ ModelAvatar: () => null }));

jest.mock('@/frontend/components/MarkdownText', () => {
  const { createElement } = jest.requireActual('react');
  return { MarkdownText: (props: object) => createElement('MarkdownText', props) };
});

jest.mock('@/frontend/components/ModelPicker', () => ({
  useModelPickerData: () => ({
    getModelItem: (modelId: string | null) =>
      ({
        'anthropic::claude': { model: { name: 'Claude' } },
        'openai::gpt': { model: { name: 'GPT' } },
      })[modelId ?? ''],
  }),
}));

jest.mock('../../../../runtime', () => ({
  useAgentAnswers: () => ({ answers: mockAnswers, isError: false, refetch: jest.fn() }),
}));

jest.mock('../../context/AssistantMessageActionsProvider', () => ({
  useAssistantMessageActions: () => mockActions,
}));

describe('MessageAnswerCards', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuoteSupported = false;
    mockSelectBranch.mockResolvedValue(true);
    mockActions = { selectBranch: mockSelectBranch };
    mockAnswers = new Map([
      ['a2', answerItem('a2', 'Second answer')],
      [
        'a3',
        answerItem('a3', '', 'error', {
          model: { id: 'gone::model', modelId: 'model', name: 'Retired', providerId: 'gone' },
        }),
      ],
      ['a4', answerItem('a4', 'Fourth answer')],
    ]);
  });

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  test('Reply on a sibling card uses that exact displayed id rather than the selected row', () => {
    mockQuoteSupported = true;
    const reply = jest.fn();
    mockActions.replyToMessage = reply;
    renderCards();
    const second = renderer!.root
      .findAllByType('ContextMenu' as never)
      .find((menu) => menu.findAll((node) => node.props.testID === 'message-answer-a2').length > 0);
    expect(second).toBeDefined();
    act(() => second!.props.items.find((item: { id: string }) => item.id === 'reply').onPress());
    expect(reply).toHaveBeenCalledWith({ messageId: 'a2' });
    expect(
      host((node) => node.props.testID === 'message-answer-a2')[0]?.props.accessibilityActions,
    ).toEqual([{ name: 'reply', label: 'chat.quote.reply' }]);
  });

  test('shows a card per answer, named by model and by its own snapshot once the model is gone', () => {
    renderCards();
    const cards = host((node) => /^message-answer-a\d$/.test(node.props.testID));

    expect(cards.map((card) => card.props.testID)).toEqual([
      'message-answer-a1',
      'message-answer-a2',
      'message-answer-a3',
      'message-answer-a4',
    ]);
    expect(texts()).toEqual(
      expect.arrayContaining([
        'chat.branch.repeatedModel:{"index":1,"model":"Claude"}',
        'GPT',
        'Retired',
        'chat.branch.repeatedModel:{"index":2,"model":"Claude"}',
        'chat.branch.failed',
      ]),
    );
    expect(markdown()).toEqual(['First answer', 'Second answer', 'Fourth answer']);
  });

  test('settling on another card shows that answer, and returns when the choice is not applied', async () => {
    let settle: (applied: boolean) => void = () => {};
    mockSelectBranch.mockReturnValue(new Promise<boolean>((resolve) => (settle = resolve)));
    renderCards();
    swipeTo(300);
    expect(mockSelectBranch).toHaveBeenCalledWith({ messageId: 'a1', targetId: 'a2' });
    expect(selectedDot()).toBe(1);

    await act(async () => settle(false));
    expect(selectedDot()).toBe(0);
  });

  test('a scroll that ends without a swipe, as after layout, chooses nothing', () => {
    renderCards();
    const [scroll] = host((node) => node.props.testID === 'message-answers-a1');

    act(() => scroll!.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 300 } } }));
    expect(mockSelectBranch).not.toHaveBeenCalled();
    expect(selectedDot()).toBe(0);
  });

  test('a choice that took effect does not return when the row later shows the earlier answer', () => {
    renderCards();
    swipeTo(300);
    expect(selectedDot()).toBe(1);

    // The selection lands, then the answer is switched back from elsewhere.
    act(() => renderer!.update(cards({ ...shown(), ...answerItem('a2', 'Second answer') })));
    expect(selectedDot()).toBe(1);
    act(() => renderer!.update(cards(shown())));
    expect(selectedDot()).toBe(0);
  });

  test('a dot shows its answer', () => {
    renderCards();
    act(() => dots()[2]!.props.onPress());
    expect(mockSelectBranch).toHaveBeenCalledWith({ messageId: 'a1', targetId: 'a3' });
  });

  test('folds a long answer to its opening and names its length instead of a button', () => {
    mockAnswers.set('a2', answerItem('a2', '字'.repeat(2_000)));
    renderCards();

    expect(markdown()[1]).toHaveLength(1_200);
    expect(texts()).toContain('chat.branch.length:{"length":"2,000"}');
    expect(texts().filter((text) => text.startsWith('chat.branch.length'))).toHaveLength(1);
  });

  test('every card opens its answer, including short text, tool-only answers and errors', () => {
    mockAnswers.set(
      'a2',
      answerItem('a2', '', 'success', {
        data: { parts: [{ type: 'reasoning', state: 'done', text: 'Reasoning without text' }] },
      }),
    );
    renderCards();

    for (const id of ['a1', 'a2', 'a3']) act(() => card(id).props.onPress());
    expect(mockExpand.mock.calls.map(([request]) => request.id)).toEqual(['a1', 'a2', 'a3']);
    expect(texts()).toContain('chat.branch.noTextPreview');
    expect(texts()).not.toContain('chat.message.stopped');
  });

  test('opening another answer shows it, and reports when it could not be shown', async () => {
    let settle: (applied: boolean) => void = () => {};
    mockSelectBranch.mockReturnValue(new Promise<boolean>((resolve) => (settle = resolve)));
    renderCards();

    act(() => card('a2').props.onPress());
    expect(mockSelectBranch).toHaveBeenCalledWith({ messageId: 'a1', targetId: 'a2' });
    const [{ selection }] = mockExpand.mock.calls[0]!;
    expect(selectedDot()).toBe(1);

    await act(async () => settle(false));
    await expect(selection).resolves.toBe(false);
    expect(selectedDot()).toBe(0);
  });

  test('opening the shown answer selects nothing', async () => {
    renderCards();

    act(() => card('a1').props.onPress());
    expect(mockSelectBranch).not.toHaveBeenCalled();
    await expect(mockExpand.mock.calls[0]![0].selection).resolves.toBe(true);
  });

  function renderCards() {
    act(() => {
      renderer = create(cards(shown()));
    });
    const [container] = host((node) => typeof node.props.onLayout === 'function');
    act(() => container!.props.onLayout({ nativeEvent: { layout: { width: 370 } } }));
  }

  function cards(message: MessageListItem) {
    return (
      <ExpandAnswerContextProvider value={mockExpand}>
        <MessageAnswerCards message={message} />
      </ExpandAnswerContextProvider>
    );
  }

  function swipeTo(x: number) {
    const [scroll] = host((node) => typeof node.props.onScrollBeginDrag === 'function');
    act(() => scroll!.props.onScrollBeginDrag());
    act(() => scroll!.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x } } }));
  }

  function host(predicate: (node: ReturnType<ReactTestRenderer['root']['find']>) => boolean) {
    return renderer!.root.findAll((node) => typeof node.type === 'string' && predicate(node));
  }

  function dots() {
    return renderer!.root.findAll(
      (node) =>
        typeof node.type !== 'string' &&
        String(node.props.accessibilityLabel).startsWith('chat.branch.page') &&
        typeof node.props.onPress === 'function',
    );
  }

  function card(id: string) {
    return renderer!.root.find(
      (node) =>
        node.props.testID === `message-answer-${id}` && typeof node.props.onPress === 'function',
    );
  }

  function texts() {
    return renderer!.root
      .findAllByType('Text' as never)
      .map((node) => node.props.children)
      .filter((child) => typeof child === 'string');
  }

  function markdown(): string[] {
    return renderer!.root.findAllByType('MarkdownText' as never).map((node) => node.props.markdown);
  }

  function selectedDot() {
    return dots().findIndex((node) => node.props.accessibilityState?.selected);
  }
});

function answerItem(
  id: string,
  text: string,
  status: MessageListItem['status'] = 'success',
  extra: Partial<MessageListItem> = {},
): MessageListItem {
  return {
    data: { parts: text ? [{ state: 'done', text, type: 'text' }] : [] },
    id,
    role: 'assistant',
    status,
    ...extra,
  };
}

function shown(): MessageListItem {
  return {
    ...answerItem('a1', 'First answer'),
    branch: {
      key: 'answers:q1',
      siblings: [
        { id: 'a1', modelId: 'anthropic::claude', status: 'success' },
        { id: 'a2', modelId: 'openai::gpt', status: 'success' },
        { id: 'a3', modelId: 'gone::model', status: 'error' },
        { id: 'a4', modelId: 'anthropic::claude', status: 'success' },
      ],
    },
    model: { id: 'anthropic::claude', modelId: 'claude', name: 'Claude', providerId: 'anthropic' },
  };
}
