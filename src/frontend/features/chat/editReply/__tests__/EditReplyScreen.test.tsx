import type { ReactNode } from 'react';
import { Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { HeaderToolbarAction } from '@/frontend/appShell/header';
import {
  AgentProtocolError,
  type AgentMessagePart,
  type AgentMessageView,
} from '@/shared/contracts/agent';

import { EditReplyScreen } from '../EditReplyScreen';

const mockBack = jest.fn();
const mockEditMessage = jest.fn();
const mockToast = jest.fn();
const mockConfirm = jest.fn();
const mockAllowLeave = jest.fn();
let mockPreventRemove = false;
let mockOnPreventedRemove: (event: { repeat: () => void }) => void = () => {};
let mockHeaderActions: readonly HeaderToolbarAction[] = [];

const parts: AgentMessagePart[] = [
  { id: 'reasoning', type: 'reasoning', text: 'Thinking', state: 'done' },
  { id: 'intro', type: 'text', text: 'Looking it up.', state: 'done' },
  {
    id: 'tool',
    type: 'dynamic-tool',
    toolCallId: 'call',
    toolName: 'read_file',
    title: 'Read file',
    toolRef: { source: 'builtin', capabilityId: 'read_file' },
    state: 'output-available',
    input: {},
    output: { value: 'Verified source', artifacts: [] },
  },
  { id: 'final', type: 'text', text: 'Final answer', state: 'done' },
];
const mockMessage: AgentMessageView = {
  id: 'answer',
  sessionId: 'session',
  turnId: 'turn',
  parentId: 'question',
  role: 'assistant',
  status: 'success',
  parts,
  stats: null,
  modelId: null,
  inferenceSnapshot: null,
  createdAt: '2026-10-29T00:00:00.000Z',
  updatedAt: '2026-10-29T00:00:00.000Z',
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ sessionId: 'session', messageId: 'answer' }),
  usePreventRemove: (prevent: boolean, callback: typeof mockOnPreventedRemove) => {
    mockPreventRemove = prevent;
    mockOnPreventedRemove = callback;
    return mockAllowLeave;
  },
  useRouter: () => ({ back: mockBack }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/appShell/header', () => ({
  RouteHeader: ({ rightActions }: { rightActions?: readonly HeaderToolbarAction[] }) => {
    mockHeaderActions = rightActions ?? [];
    return null;
  },
}));
jest.mock('@/frontend/components/Message', () => {
  const { Text } = require('react-native');
  return {
    MessagePartRenderer: ({ part }: { part: { type: string } }) => (
      <Text>{`part:${part.type}`}</Text>
    ),
    ToolGroupPart: ({ tools }: { tools: { toolCallId: string }[] }) => (
      <Text>{`tools:${tools.map((tool) => tool.toolCallId).join(',')}`}</Text>
    ),
    useMessageProcessTitle: () => 'process',
  };
});
jest.mock('@cherrystudio/ui/components', () => ({
  ContentState: { Error: () => null, Loading: () => null },
  MessagePart: { Process: ({ children }: { children: ReactNode }) => children },
  Section: ({ children }: { children: ReactNode }) => children,
  useAlert: () => ({ alert: { confirm: mockConfirm } }),
  useToast: () => ({ toast: { show: mockToast } }),
}));
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({ editMessage: mockEditMessage }),
}));
jest.mock('@/frontend/data/hooks', () => ({
  useQuery: () => ({ data: { items: [mockMessage] }, isError: false, isLoading: false }),
}));
jest.mock('@/frontend/hooks/useThemeColor', () => ({ useThemeColor: () => '#888' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

function save() {
  const action = mockHeaderActions.find((item) => item.key === 'save');
  if (action?.type !== 'label') throw new Error('Missing save action');
  return action;
}

describe('EditReplyScreen', () => {
  let renderer: ReactTestRenderer;
  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      renderer = create(<EditReplyScreen />);
    });
  });
  afterEach(() => act(() => renderer.unmount()));

  it('shows prose as editable segments between read-only process rows and saves only changes', async () => {
    const inputs = renderer.root.findAllByType(TextInput);
    expect(inputs.map((input) => input.props.value)).toEqual(['Looking it up.', 'Final answer']);
    expect(renderer.root.findAllByType(Text).map((text) => text.props.children)).toEqual(
      expect.arrayContaining(['part:reasoning', 'tools:call']),
    );
    expect(save().disabled).toBe(true);

    act(() => inputs[1]!.props.onChangeText('   '));
    expect(save().disabled).toBe(true);
    act(() => inputs[1]!.props.onChangeText('Corrected answer'));
    expect(save().disabled).toBe(false);

    mockEditMessage.mockResolvedValueOnce(mockMessage);
    await act(async () => save().onPress());
    expect(mockEditMessage).toHaveBeenCalledWith({
      sessionId: 'session',
      messageId: 'answer',
      parts: [{ id: 'final', expectedText: 'Final answer', text: 'Corrected answer' }],
    });
    expect(mockToast).toHaveBeenCalledWith({
      label: 'chat.messageActions.editSaved',
      variant: 'success',
    });
    expect(mockAllowLeave.mock.invocationCallOrder[0]).toBeLessThan(
      mockBack.mock.invocationCallOrder[0]!,
    );
  });

  it('confirms before leaving with unsaved edits', async () => {
    expect(mockPreventRemove).toBe(false);
    act(() => renderer.root.findAllByType(TextInput)[1]!.props.onChangeText('Corrected answer'));
    expect(mockPreventRemove).toBe(true);

    const repeat = jest.fn();
    act(() => mockOnPreventedRemove({ repeat }));
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'chat.messageActions.editDiscardTitle' }),
    );
    act(() => mockConfirm.mock.calls[0][0].onConfirm());
    expect(repeat).toHaveBeenCalled();
    expect(mockPreventRemove).toBe(false);
  });

  it('holds the page without a prompt while a save is in flight', () => {
    act(() => renderer.root.findAllByType(TextInput)[1]!.props.onChangeText('Corrected answer'));
    mockEditMessage.mockReturnValueOnce(new Promise(() => {}));
    act(() => void save().onPress());
    expect(mockPreventRemove).toBe(true);
    act(() => mockOnPreventedRemove({ repeat: jest.fn() }));
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('keeps the drafts on the page when the answer changed meanwhile', async () => {
    act(() => renderer.root.findAllByType(TextInput)[0]!.props.onChangeText('Checking it.'));
    mockEditMessage.mockRejectedValueOnce(
      new AgentProtocolError({ code: 'MESSAGE_CONFLICT', message: 'Changed', retryable: false }),
    );
    await act(async () => save().onPress());
    expect(mockToast).toHaveBeenCalledWith({
      label: 'chat.messageActions.editConflict',
      variant: 'danger',
    });
    expect(mockBack).not.toHaveBeenCalled();
    expect(renderer.root.findAllByType(TextInput)[0]!.props.value).toBe('Checking it.');
    expect(save().disabled).toBe(false);
  });
});
