import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessagePresentationItem } from '../../../types';
import { AssistantMessageRow } from '../AssistantMessageRow';

const mockMessageParts = jest.fn((_props: { message: MessagePresentationItem }) => null);
const mockDotMatrixSquare20 = jest.fn((_props: { active: boolean; size: number }) => null);

jest.mock('../../../messageContent', () => ({
  MessageParts: (props: { message: MessagePresentationItem }) => mockMessageParts(props),
}));

jest.mock('@cherrystudio/ui/components', () => ({
  DotMatrixSquare20: (props: { active: boolean; size: number }) => mockDotMatrixSquare20(props),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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

describe('AssistantMessageRow', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  test('shows the pending placeholder for an empty pending assistant message', () => {
    act(() => {
      renderer = create(<AssistantMessageRow message={createAssistantMessage('pending')} />);
    });

    expect(mockDotMatrixSquare20).toHaveBeenCalledWith({ active: true, size: 20 });
    expect(mockMessageParts).not.toHaveBeenCalled();
  });

  test('renders structured parts once assistant content is available', () => {
    const message = createAssistantMessage('pending', [{ text: 'Thinking', type: 'text' }]);

    act(() => {
      renderer = create(<AssistantMessageRow message={message} />);
    });

    expect(mockMessageParts).toHaveBeenCalledWith({ message });
    expect(mockDotMatrixSquare20).not.toHaveBeenCalled();
  });
});
