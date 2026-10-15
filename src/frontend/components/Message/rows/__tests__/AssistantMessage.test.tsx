import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '../../types';
import { AssistantMessage } from '../AssistantMessage';

// 正文渲染成宿主元素而不是 null，组合槽位的测试才能在树里定位它、断言正文与配件的先后。
const mockMessageParts = jest.fn((props: { message: MessageListItem }) =>
  createElement('MessageParts', props),
);

jest.mock('../../parts/MessageParts', () => ({
  MessageParts: (props: { message: MessageListItem }) => mockMessageParts(props),
}));

jest.mock('@cherrystudio/ui/components', () => ({
  ImageGenerationLoader: (props: object) =>
    jest.requireActual('react').createElement('ImageGenerationLoader', props),
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

  test('uses the image placeholder until assistant content arrives', () => {
    const message = {
      ...createAssistantMessage('pending'),
      imageGeneration: { paramValues: { aspectRatio: '16:9' } },
    };
    act(() => {
      renderer = create(<AssistantMessage message={message} />);
    });
    expect(renderer!.root.findAllByType('MessageParts')).toHaveLength(0);

    act(() => {
      renderer!.root.findByProps({ className: 'w-full' }).props.onLayout({
        nativeEvent: { layout: { width: 320 } },
      });
    });
    expect(renderer!.root.findByType('ImageGenerationLoader').props.height).toBe(180);

    act(() => {
      renderer!.update(
        <AssistantMessage
          message={{ ...message, data: { parts: [{ type: 'text', text: 'Result' }] } }}
        />,
      );
    });
    expect(renderer!.root.findAllByType('ImageGenerationLoader')).toHaveLength(0);
    expect(renderer!.root.findAllByType('MessageParts')).toHaveLength(1);
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

    const rendered = renderer?.root.findAll(
      (node) => node.type === 'MessageParts' || node.type === AccessoryProbe,
    );
    expect(rendered?.map((node) => node.type)).toEqual(['MessageParts', AccessoryProbe]);
  });
});

function AccessoryProbe() {
  return null;
}
