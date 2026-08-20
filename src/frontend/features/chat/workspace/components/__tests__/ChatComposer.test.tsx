import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatComposer } from '../ChatComposer';

let mockDockProps: Record<string, unknown> | undefined;
let mockInputProps: Record<string, unknown> | undefined;

jest.mock('@cherrystudio/ui/components', () => ({
  Composer: {
    Dock: ({ children, ...props }: { children?: React.ReactNode }) => {
      mockDockProps = props;
      return children;
    },
  },
}));

jest.mock('@/frontend/components/composer', () => ({
  ManagedComposerProvider: ({ children }: { children?: React.ReactNode }) => children,
}));

jest.mock('../../../input', () => ({
  ChatInput: (props: Record<string, unknown>) => {
    mockInputProps = props;
    return null;
  },
}));

describe('ChatComposer', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    mockDockProps = undefined;
    mockInputProps = undefined;
  });

  it('connects the CherryUI dock measurement to the Chat input', () => {
    const onHeightChange = jest.fn();

    act(() => {
      renderer = create(
        <ChatComposer
          assistantId="assistant-1"
          dismissKeyboardOnSend={false}
          onHeightChange={onHeightChange}
          topicId="topic-1"
        />,
      );
    });

    expect(mockDockProps?.onHeightChange).toBe(onHeightChange);
    expect(mockInputProps).toEqual({
      assistantId: 'assistant-1',
      dismissKeyboardOnSend: false,
      topicId: 'topic-1',
    });
  });
});
