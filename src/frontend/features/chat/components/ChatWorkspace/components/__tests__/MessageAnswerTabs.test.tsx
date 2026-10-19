import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '@/frontend/components/Message';

import { MessageAnswerStop, MessageAnswerTabs } from '../MessageAnswerTabs';

const mockSelectBranch = jest.fn();
const mockStopAnswer = jest.fn();
let mockActions: Record<string, jest.Mock | undefined> = {};

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  const Button = (props: object) => createElement('Button', props);
  Button.Label = ({ children }: { children: ReactNode }) => children;
  return {
    BackgroundPressExclusion: ({ children }: { children: ReactNode }) => children,
    Button,
    ScrollShadow: ({ children }: { children: ReactNode }) => children,
    Spinner: () => null,
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
    mockActions = { selectBranch: mockSelectBranch, stopAnswer: mockStopAnswer };
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
      'chat.branch.repeatedModel:{"model":"Claude","index":1}',
      'chat.branch.answerStatus:{"model":"GPT","status":"chat.branch.answering"}',
      'chat.branch.answerStatus:{"model":"chat.branch.repeatedModel:{\\"model\\":\\"Claude\\",\\"index\\":2}","status":"chat.branch.failed"}',
      'chat.branch.answerStatus:{"model":"chat.branch.unknownModel","status":"chat.message.stopped"}',
    ]);

    act(() => tabs.props.onValueChange('a2'));
    expect(mockSelectBranch).toHaveBeenCalledWith({ messageId: 'a1', targetId: 'a2' });
  });

  test('renders nothing where answers cannot be switched', () => {
    mockActions = {};
    act(() => {
      renderer = create(<MessageAnswerTabs message={answer()} />);
    });

    expect(renderer!.root.findAllByType('Tabs' as never)).toHaveLength(0);
  });

  test('stops only a running parallel answer', () => {
    const running: MessageListItem = {
      ...answer(),
      model: { id: 'openai::gpt', modelId: 'gpt', name: 'GPT', providerId: 'openai' },
      status: 'pending',
    };
    act(() => {
      renderer = create(<MessageAnswerStop message={running} />);
    });
    act(() => renderer!.root.findByProps({ testID: 'message-answer-stop' }).props.onPress());
    expect(mockStopAnswer).toHaveBeenCalledWith({ messageId: 'a1' });

    act(() =>
      renderer!.update(
        <MessageAnswerStop
          message={{ ...running, branch: { ...running.branch!, multiModel: false } }}
        />,
      ),
    );
    expect(renderer!.root.findAllByProps({ testID: 'message-answer-stop' })).toHaveLength(0);
  });
});

function answer(): MessageListItem {
  return {
    branch: {
      multiModel: true,
      siblings: [
        { id: 'a1', modelId: 'anthropic::claude', status: 'success' },
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
