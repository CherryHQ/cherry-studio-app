import { createRef, type Ref, useImperativeHandle } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatShareSelectionProvider, useChatShareSelection } from '../ChatShareSelectionProvider';

const mockShareChat = jest.fn();
const mockCancelShare = jest.fn();
const mockToastShow = jest.fn();
const mockTranslate = (key: string) => key;

jest.mock('../useShareChat', () => ({
  useShareChat: () => ({
    shareChat: mockShareChat,
    cancelShare: mockCancelShare,
    isSharing: false,
  }),
}));
jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockToastShow } }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockTranslate }),
}));
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('@/frontend/components/Selection', () => ({
  toggleSelection: jest.requireActual('@/frontend/components/Selection/selection').toggleSelection,
}));

type Selection = ReturnType<typeof useChatShareSelection>;
function SelectionProbe({ ref }: { ref: Ref<Selection> }) {
  const selection = useChatShareSelection();
  useImperativeHandle(ref, () => selection, [selection]);
  return null;
}

let renderer: ReactTestRenderer;
const selection = createRef<Selection>();

beforeEach(() => {
  jest.clearAllMocks();
  act(() => {
    renderer = create(
      <ChatShareSelectionProvider sessionId="session">
        <SelectionProbe ref={selection} />
      </ChatShareSelectionProvider>,
    );
  });
});
afterEach(() => act(() => renderer.unmount()));

test('the message action enters selection and only confirmation opens sharing', () => {
  act(() => selection.current!.startSelection({ messageId: 'answer' }));
  expect(selection.current!.isSelecting).toBe(true);
  expect([...selection.current!.selectedIds]).toEqual(['answer']);
  expect(mockShareChat).not.toHaveBeenCalled();

  act(() => selection.current!.toggleMessage('question'));
  expect(mockShareChat).not.toHaveBeenCalled();
  act(() => selection.current!.confirmSelection());
  expect(mockShareChat).toHaveBeenCalledWith(['answer', 'question']);
});

test('deselecting all messages prevents confirmation', () => {
  act(() => selection.current!.startSelection({ messageId: 'answer' }));
  act(() => selection.current!.toggleMessage('answer'));
  act(() => selection.current!.confirmSelection());
  expect(selection.current!.isSelecting).toBe(true);
  expect(selection.current!.selectedIds.size).toBe(0);
  expect(mockShareChat).not.toHaveBeenCalled();
});

test('cancelling aborts preparation and clears the selection before another entry', () => {
  act(() => selection.current!.startSelection({ messageId: 'answer' }));
  mockCancelShare.mockClear();
  act(() => selection.current!.cancelSelection());
  expect(mockCancelShare).toHaveBeenCalledTimes(1);
  expect(selection.current!.isSelecting).toBe(false);
  expect(selection.current!.selectedIds.size).toBe(0);
  act(() => selection.current!.startSelection({ messageId: 'another-answer' }));
  expect([...selection.current!.selectedIds]).toEqual(['another-answer']);
  expect(mockShareChat).not.toHaveBeenCalled();
});
