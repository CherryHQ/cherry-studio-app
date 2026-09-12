import { createRef, type Ref, useImperativeHandle } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DOCUMENT_EXPORT_MAX_SECTIONS } from '@/shared/contracts/documentExport';

import {
  ChatShareSelectionProvider,
  useChatShareSelectionActions,
  useChatShareSelectionCount,
  useChatShareSelectionState,
  useIsChatMessageSelected,
} from '../ChatShareSelectionProvider';

const mockShareChat = jest.fn();
const mockCancelShare = jest.fn();
const mockToastShow = jest.fn();
const mockToast = { show: mockToastShow };
const mockTranslate = (key: string) => key;
const mockMessageRender = jest.fn();
const mockModeRender = jest.fn();
const mockActionsRender = jest.fn();

jest.mock('../useShareChat', () => ({
  useShareChat: () => ({
    shareChat: mockShareChat,
    cancelShare: mockCancelShare,
    isSharing: false,
  }),
}));
jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: mockToast }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockTranslate }),
}));
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('@/frontend/components/Selection', () => ({
  toggleSelection: jest.requireActual('@/frontend/components/Selection/selection').toggleSelection,
}));

type Selection = ReturnType<typeof useChatShareSelectionActions> &
  ReturnType<typeof useChatShareSelectionState> & { selectedCount: number };
function SelectionProbe({ ref }: { ref: Ref<Selection> }) {
  const state = useChatShareSelectionState();
  const actions = useChatShareSelectionActions();
  const selectedCount = useChatShareSelectionCount();
  useImperativeHandle(ref, () => ({ ...state, ...actions, selectedCount }), [
    state,
    actions,
    selectedCount,
  ]);
  return null;
}

function MessageSelectionProbe({ messageId }: { messageId: string }) {
  const { isSelecting, isSharing } = useChatShareSelectionState();
  useChatShareSelectionActions();
  const isSelected = useIsChatMessageSelected(messageId);
  mockMessageRender(messageId, isSelected, isSelecting, isSharing);
  return null;
}

function ModeProbe() {
  mockModeRender(useChatShareSelectionState());
  return null;
}

function ActionsProbe() {
  mockActionsRender(useChatShareSelectionActions());
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
        <MessageSelectionProbe messageId="answer" />
        <MessageSelectionProbe messageId="question" />
        <ModeProbe />
        <ActionsProbe />
      </ChatShareSelectionProvider>,
    );
  });
});
afterEach(() => act(() => renderer.unmount()));

test('the message action enters selection and only confirmation opens sharing', () => {
  act(() => selection.current!.startSelection({ messageId: 'answer' }));
  expect(selection.current!.isSelecting).toBe(true);
  expect(selection.current!.selectedCount).toBe(1);
  expect(mockMessageRender).toHaveBeenCalledWith('answer', true, true, false);
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
  expect(selection.current!.selectedCount).toBe(0);
  expect(mockShareChat).not.toHaveBeenCalled();
});

test('cancelling aborts preparation and clears the selection before another entry', () => {
  act(() => selection.current!.startSelection({ messageId: 'answer' }));
  mockCancelShare.mockClear();
  act(() => selection.current!.cancelSelection());
  expect(mockCancelShare).toHaveBeenCalledTimes(1);
  expect(selection.current!.isSelecting).toBe(false);
  expect(selection.current!.selectedCount).toBe(0);
  act(() => selection.current!.startSelection({ messageId: 'another-answer' }));
  expect(selection.current!.selectedCount).toBe(1);
  expect(mockShareChat).not.toHaveBeenCalled();
  act(() => selection.current!.confirmSelection());
  expect(mockShareChat).toHaveBeenCalledWith(['another-answer']);
});

test('a toggle updates only its message and count, leaving mode and actions consumers stable', () => {
  act(() => selection.current!.startSelection({ messageId: 'answer' }));
  mockMessageRender.mockClear();
  mockModeRender.mockClear();
  mockActionsRender.mockClear();

  act(() => selection.current!.toggleMessage('question'));
  expect(mockMessageRender.mock.calls).toEqual([['question', true, true, false]]);
  expect(selection.current!.selectedCount).toBe(2);
  expect(mockModeRender).not.toHaveBeenCalled();
  expect(mockActionsRender).not.toHaveBeenCalled();

  mockMessageRender.mockClear();
  act(() => selection.current!.toggleMessage('question'));
  expect(mockMessageRender.mock.calls).toEqual([['question', false, true, false]]);
  expect(selection.current!.selectedCount).toBe(1);
});

test('confirmation and the selection limit read all changes made before React renders', () => {
  act(() => selection.current!.startSelection());
  act(() => {
    for (let index = 0; index < DOCUMENT_EXPORT_MAX_SECTIONS; index++) {
      selection.current!.toggleMessage(`message-${index}`);
    }
    selection.current!.toggleMessage('over-limit');
    selection.current!.confirmSelection();
  });
  expect(selection.current!.selectedCount).toBe(DOCUMENT_EXPORT_MAX_SECTIONS);
  expect(mockToastShow).toHaveBeenCalledTimes(1);
  expect(mockShareChat).toHaveBeenCalledWith(
    Array.from({ length: DOCUMENT_EXPORT_MAX_SECTIONS }, (_, index) => `message-${index}`),
  );
});

test('a row reads its own selection when a virtualized slot changes message identity', () => {
  act(() => selection.current!.startSelection({ messageId: 'answer' }));
  mockMessageRender.mockClear();
  act(() => {
    renderer.update(
      <ChatShareSelectionProvider sessionId="session">
        <SelectionProbe ref={selection} />
        <MessageSelectionProbe messageId="question" />
      </ChatShareSelectionProvider>,
    );
  });
  expect(mockMessageRender).toHaveBeenLastCalledWith('question', false, true, false);
  act(() => {
    renderer.update(
      <ChatShareSelectionProvider sessionId="session">
        <SelectionProbe ref={selection} />
        <MessageSelectionProbe messageId="answer" />
      </ChatShareSelectionProvider>,
    );
  });
  expect(mockMessageRender).toHaveBeenLastCalledWith('answer', true, true, false);
});
