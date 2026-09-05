import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '../../types';
import { AssistantMessage } from '../AssistantMessage';

// 正文渲染成宿主元素而不是 null，组合槽位的测试才能在树里定位它、断言正文与配件的先后。
const mockMessageParts = jest.fn(
  (props: { isTextSelectionEnabled: boolean; message: MessageListItem }) =>
    createElement('MessageParts', props),
);
const mockMessagePartPending = jest.fn((_props: { accessibilityLabel: string }) => null);

jest.mock('../../parts/MessageParts', () => ({
  MessageParts: (props: { isTextSelectionEnabled: boolean; message: MessageListItem }) =>
    mockMessageParts(props),
}));

jest.mock('@cherrystudio/ui/components', () => ({
  MessagePart: {
    Pending: (props: { accessibilityLabel: string }) => mockMessagePartPending(props),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function createAssistantMessage(
  status: MessageListItem['status'],
  parts: MessageListItem['data']['parts'] = [],
): MessageListItem {
  return {
    data: { parts },
    id: 'assistant-1',
    role: 'assistant',
    status,
  };
}

describe('AssistantMessage', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  test('shows the pending placeholder for an empty pending assistant message', () => {
    act(() => {
      renderer = create(<AssistantMessage message={createAssistantMessage('pending')} />);
    });

    expect(mockMessagePartPending).toHaveBeenCalledWith({
      accessibilityLabel: 'chat.message.waitingForResponse',
    });
    expect(mockMessageParts).not.toHaveBeenCalled();
  });

  test('renders structured parts once assistant content is available', () => {
    const message = createAssistantMessage('pending', [{ text: 'Thinking', type: 'text' }]);

    act(() => {
      renderer = create(<AssistantMessage message={message} />);
    });

    expect(mockMessageParts).toHaveBeenCalledWith({ isTextSelectionEnabled: true, message });
    expect(mockMessagePartPending).not.toHaveBeenCalled();
  });

  test('passes an explicit text-selection policy to structured parts', () => {
    const message = createAssistantMessage('success', [{ text: 'Answer', type: 'text' }]);

    act(() => {
      renderer = create(<AssistantMessage isTextSelectionEnabled={false} message={message} />);
    });

    expect(mockMessageParts).toHaveBeenCalledWith({ isTextSelectionEnabled: false, message });
  });

  test('renders composed children after the message body', () => {
    const message = createAssistantMessage('success', [{ text: 'Answer', type: 'text' }]);

    act(() => {
      renderer = create(
        <AssistantMessage message={message}>
          <AccessoryProbe />
        </AssistantMessage>,
      );
    });

    const rendered = renderer?.root.findAll(
      (node) => node.type === 'MessageParts' || node.type === AccessoryProbe,
    );

    expect(rendered?.map((node) => node.type)).toEqual(['MessageParts', AccessoryProbe]);
  });

  test('keeps the composition slot during the pending placeholder', () => {
    act(() => {
      renderer = create(
        <AssistantMessage message={createAssistantMessage('pending')}>
          <AccessoryProbe />
        </AssistantMessage>,
      );
    });

    expect(mockMessagePartPending).toHaveBeenCalledWith({
      accessibilityLabel: 'chat.message.waitingForResponse',
    });
    expect(renderer?.root.findAllByType(AccessoryProbe)).toHaveLength(1);
  });
});

function AccessoryProbe() {
  return null;
}
