import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '@/frontend/components/Message';

import { MessageAnswerTabs } from '../MessageAnswerTabs';

const mockSelectBranch = jest.fn();
let mockActions: Record<string, jest.Mock | undefined> = {};

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    BackgroundPressExclusion: ({ children }: { children: ReactNode }) => children,
    ScrollShadow: ({ children }: { children: ReactNode }) => children,
    Spinner: () => createElement('Spinner'),
    Tabs: (props: object) => createElement('Tabs', props),
  };
});

jest.mock('@cherrystudio/ui/utils', () => ({ cn: (...names: unknown[]) => names.join(' ') }));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}));

jest.mock('@/frontend/components/Avatar', () => ({ ModelAvatar: () => null }));

jest.mock('@/frontend/hooks/useThemeColor', () => ({ useThemeColor: () => '#ffffff' }));

jest.mock('@/frontend/components/ModelPicker', () => ({
  useModelPickerData: () => ({
    getModelItem: (modelId: string | null) =>
      ({
        'anthropic::claude': { model: { name: 'Claude' } },
        'openai::gpt': { model: { name: 'GPT' } },
      })[modelId ?? ''],
  }),
}));

jest.mock('../../context/AssistantMessageActionsProvider', () => ({
  useAssistantMessageActions: () => mockActions,
}));

describe('MessageAnswerTabs', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectBranch.mockResolvedValue(true);
    mockActions = { selectBranch: mockSelectBranch };
  });

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  test('names each answer by model, numbering a repeated model and stating unsettled answers', () => {
    act(() => {
      renderer = create(<MessageAnswerTabs message={answer()} />);
    });
    const tabs = renderer!.root.findByType('Tabs' as never);

    expect(tabs.props.value).toBe('a1');
    expect(tabs.props.items.map((item: { label: string }) => item.label)).toEqual([
      'chat.branch.answerStatus:{"model":"chat.branch.repeatedModel:{\\"model\\":\\"Claude\\",\\"index\\":1}","status":"chat.branch.answering"}',
      'chat.branch.answerStatus:{"model":"GPT","status":"chat.branch.answering"}',
      'chat.branch.answerStatus:{"model":"chat.branch.repeatedModel:{\\"model\\":\\"Claude\\",\\"index\\":2}","status":"chat.branch.failed"}',
      'chat.branch.answerStatus:{"model":"chat.branch.unknownModel","status":"chat.message.stopped"}',
    ]);

    act(() => tabs.props.onValueChange('a2'));
    expect(mockSelectBranch).toHaveBeenCalledWith({ messageId: 'a1', targetId: 'a2' });
  });

  test('moves the tab at once and back when the choice is not applied', async () => {
    let settle: (applied: boolean) => void = () => {};
    mockSelectBranch.mockReturnValue(new Promise<boolean>((resolve) => (settle = resolve)));
    act(() => {
      renderer = create(<MessageAnswerTabs message={answer()} />);
    });
    const tabs = () => renderer!.root.findByType('Tabs' as never);

    act(() => tabs().props.onValueChange('a2'));
    expect(tabs().props.value).toBe('a2');
    await act(async () => settle(false));
    expect(tabs().props.value).toBe('a1');
  });

  test('renders nothing where answers cannot be switched', () => {
    mockActions = {};
    act(() => {
      renderer = create(<MessageAnswerTabs message={answer()} />);
    });

    expect(renderer!.root.findAllByType('Tabs' as never)).toHaveLength(0);
  });

  test('only shows a running indicator for answers outside the selected tab', () => {
    act(() => {
      renderer = create(<MessageAnswerTabs message={answer()} />);
    });
    const item = renderer!.root.findByType('Tabs' as never).props.items[0];
    let tab: ReactTestRenderer;
    act(() => {
      tab = create(item.children({ isSelected: true }));
    });
    expect(tab!.root.findAllByType('Spinner' as never)).toHaveLength(0);
    act(() => {
      tab!.update(item.children({ isSelected: false }));
    });
    expect(tab!.root.findAllByType('Spinner' as never)).toHaveLength(1);
    act(() => tab!.unmount());
  });
});

function answer(): MessageListItem {
  return {
    branch: {
      key: 'answers:question',
      siblings: [
        { id: 'a1', modelId: 'anthropic::claude', status: 'pending' },
        { id: 'a2', modelId: 'openai::gpt', status: 'pending' },
        { id: 'a3', modelId: 'anthropic::claude', status: 'error' },
        { id: 'a4', modelId: 'removed::model', status: 'paused' },
      ],
    },
    data: { parts: [] },
    id: 'a1',
    role: 'assistant',
    status: 'success',
  };
}
