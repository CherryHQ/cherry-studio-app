import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '@/frontend/components/Message';

import { AnswerReadingBar, MessageAnswerCards } from '../MessageAnswerCards';

const mockSelectBranch = jest.fn();
let mockActions: Record<string, jest.Mock | undefined> = {};
let mockAnswers = new Map<string, MessageListItem>();

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    BackgroundPressExclusion: ({ children }: { children: ReactNode }) => children,
    Button: (props: object) => createElement('Button', props),
    ShimmerText: (props: object) => createElement('ShimmerText', props),
    Skeleton: () => createElement('Skeleton'),
    Spinner: () => createElement('Spinner'),
  };
});

jest.mock('@cherrystudio/ui/utils', () => ({ cn: (...names: unknown[]) => names.join(' ') }));

jest.mock('@react-native-masked-view/masked-view', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));

jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));

jest.mock('@/frontend/hooks/useThemeColor', () => ({ useThemeColor: () => 'black' }));

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
    const [scroll] = host((node) => node.props.testID === 'message-answers-a1');

    act(() => scroll!.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 300 } } }));
    expect(mockSelectBranch).toHaveBeenCalledWith({ messageId: 'a1', targetId: 'a2' });
    expect(selectedDot()).toBe(1);

    await act(async () => settle(false));
    expect(selectedDot()).toBe(0);
  });

  test('a dot shows its answer', () => {
    renderCards();
    act(() => dots()[2]!.props.onPress());
    expect(mockSelectBranch).toHaveBeenCalledWith({ messageId: 'a1', targetId: 'a3' });
  });

  test('folds a long answer to its opening and reads it in full after selection succeeds', async () => {
    const onExpand = jest.fn();
    mockAnswers.set('a2', answerItem('a2', '字'.repeat(2_000)));
    renderCards(onExpand);
    const expand = readButton('a2');

    expect(expand.props.testID).toBe('message-answer-a2-expand');
    expect(expand.props.children).toBe('chat.branch.expand:{"length":"2,000"}');
    expect(markdown()[1]).toHaveLength(1_200);

    await act(async () => expand.props.onPress());
    expect(mockSelectBranch).toHaveBeenCalledWith({ messageId: 'a1', targetId: 'a2' });
    expect(onExpand).toHaveBeenCalled();
  });

  test('keeps a full-view entry for short text, tool-only answers and errors', () => {
    mockAnswers.set(
      'a2',
      answerItem('a2', '', 'success', {
        data: { parts: [{ type: 'reasoning', state: 'done', text: 'Reasoning without text' }] },
      }),
    );
    renderCards();

    expect(readButton('a1').props.children).toBe('chat.branch.read');
    expect(readButton('a2').props.children).toBe('chat.branch.read');
    expect(readButton('a3').props.children).toBe('chat.branch.read');
    expect(texts()).toContain('chat.branch.noTextPreview');
    expect(texts()).not.toContain('chat.message.stopped');
  });

  test('waits for an in-flight choice before opening and stays folded if it fails', async () => {
    let settle: (applied: boolean) => void = () => {};
    mockSelectBranch.mockReturnValue(new Promise<boolean>((resolve) => (settle = resolve)));
    const onExpand = jest.fn();
    renderCards(onExpand);

    act(() => dots()[1]!.props.onPress());
    act(() => readButton('a2').props.onPress());
    expect(mockSelectBranch).toHaveBeenCalledTimes(1);
    expect(onExpand).not.toHaveBeenCalled();

    await act(async () => settle(false));
    expect(onExpand).not.toHaveBeenCalled();
    expect(selectedDot()).toBe(0);
  });

  test('the reading bar names the answer read in full, switches it and folds back', () => {
    const onCollapse = jest.fn();
    const onSelect = jest.fn();
    act(() => {
      renderer = create(
        <AnswerReadingBar message={shown()} onCollapse={onCollapse} onSelect={onSelect} />,
      );
    });

    expect(texts()).toContain('chat.branch.repeatedModel:{"index":1,"model":"Claude"}');
    act(() => dots()[0]!.props.onPress());
    expect(onSelect).not.toHaveBeenCalled();
    act(() => dots()[1]!.props.onPress());
    expect(onSelect).toHaveBeenCalledWith('a2');
    act(() => renderer!.root.findByType('Button' as never).props.onPress());
    expect(onCollapse).toHaveBeenCalled();
  });

  function renderCards(onExpand = jest.fn()) {
    act(() => {
      renderer = create(<MessageAnswerCards message={shown()} onExpand={onExpand} />);
    });
    const [container] = host((node) => typeof node.props.onLayout === 'function');
    act(() => container!.props.onLayout({ nativeEvent: { layout: { width: 370 } } }));
  }

  function host(predicate: (node: ReturnType<ReactTestRenderer['root']['find']>) => boolean) {
    return renderer!.root.findAll((node) => typeof node.type === 'string' && predicate(node));
  }

  function dots() {
    return renderer!.root.findAll(
      (node) =>
        node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
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

  function readButton(id: string) {
    return renderer!.root
      .findAllByType('Button' as never)
      .find((button) => button.props.testID === `message-answer-${id}-expand`)!;
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
