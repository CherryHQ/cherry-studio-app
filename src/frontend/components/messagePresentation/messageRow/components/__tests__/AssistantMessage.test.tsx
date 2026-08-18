import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessagePresentationItem } from '../../../types';
import { AssistantMessage } from '../AssistantMessage';

// 正文渲染成宿主元素而不是 null，组合槽位的测试才能在树里定位它、断言正文与配件的先后。
const mockMessageParts = jest.fn((props: { message: MessagePresentationItem }) =>
  createElement('MessageParts', props),
);
const mockDotMatrixSquare20 = jest.fn((_props: { active: boolean; size: number }) => null);

jest.mock('../../../messageContent', () => ({
  MessageParts: (props: { message: MessagePresentationItem }) => mockMessageParts(props),
}));

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');

  return {
    DotMatrixSquare20: (props: { active: boolean; size: number }) => mockDotMatrixSquare20(props),
    MessagePart: {
      Status: ({ children }: { children: React.ReactNode }) =>
        React.createElement('MessagePartStatus', null, children),
      StatusTextFloor: () => null,
    },
  };
});

// 真模块在 jest 下会去装 worklets 的原生 unpacker 并崩掉，本套件只关心渲染出什么。
jest.mock('react-native-reanimated', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return { __esModule: true, default: { View: MockView } };
});

jest.mock('../../slideIn/hooks/useAssistantSlideInStyle', () => ({
  useAssistantSlideInStyle: () => undefined,
}));

function createAssistantMessage(
  status: MessagePresentationItem['status'],
  parts: MessagePresentationItem['data']['parts'] = [],
): MessagePresentationItem {
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

    expect(mockDotMatrixSquare20).toHaveBeenCalledWith({ active: true, size: 20 });
    expect(mockMessageParts).not.toHaveBeenCalled();
  });

  test('renders structured parts once assistant content is available', () => {
    const message = createAssistantMessage('pending', [{ text: 'Thinking', type: 'text' }]);

    act(() => {
      renderer = create(<AssistantMessage message={message} />);
    });

    expect(mockMessageParts).toHaveBeenCalledWith({ message });
    expect(mockDotMatrixSquare20).not.toHaveBeenCalled();
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

    expect(mockDotMatrixSquare20).toHaveBeenCalledWith({ active: true, size: 20 });
    expect(renderer?.root.findAllByType(AccessoryProbe)).toHaveLength(1);
  });
});

function AccessoryProbe() {
  return null;
}
