import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessagePresentationItem } from '../../../types';
import { AssistantMessageRow } from '../AssistantMessageRow';

const mockMessageParts = jest.fn((_props: { message: MessagePresentationItem }) => null);
const mockPrismSweep = jest.fn((_props: { active: boolean }) => null);

jest.mock('../../../messageContent', () => ({
  MessageParts: (props: { message: MessagePresentationItem }) => mockMessageParts(props),
}));

jest.mock('@cherrystudio/ui/components', () => ({
  PrismSweep: (props: { active: boolean }) => mockPrismSweep(props),
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

    expect(mockPrismSweep).toHaveBeenCalledWith({ active: true });
    expect(mockMessageParts).not.toHaveBeenCalled();
  });

  test('renders structured parts once assistant content is available', () => {
    const message = createAssistantMessage('pending', [{ text: 'Thinking', type: 'text' }]);

    act(() => {
      renderer = create(<AssistantMessageRow message={message} />);
    });

    expect(mockMessageParts).toHaveBeenCalledWith({ message });
    expect(mockPrismSweep).not.toHaveBeenCalled();
  });
});
