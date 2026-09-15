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
const mockStateRender = jest.fn();
const mockActionsRender = jest.fn();
let mockFocusEffect: () => () => void;

jest.mock('../useShareChat', () => ({
  useShareChat: () => ({
    shareChat: mockShareChat,
    cancelShare: mockCancelShare,
    isSharing: false,
  }),
}));
jest.mock('@cherrystudio/ui/components', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockTranslate }) }));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => () => void) => {
    mockFocusEffect = effect;
  },
}));
jest.mock('@/frontend/components/Selection', () => ({
  toggleSelection: jest.requireActual('@/frontend/components/Selection/selection').toggleSelection,
}));

type Selection = ReturnType<typeof useChatShareSelectionActions> & { selectedCount: number };
function SelectionProbe({ ref }: { ref: Ref<Selection> }) {
  const actions = useChatShareSelectionActions();
  const selectedCount = useChatShareSelectionCount();
  useImperativeHandle(ref, () => ({ ...actions, selectedCount }), [actions, selectedCount]);
  return null;
}
function MessageSelectionProbe({ messageId }: { messageId: string }) {
  const { isSharing } = useChatShareSelectionState();
  useChatShareSelectionActions();
  mockMessageRender(messageId, useIsChatMessageSelected(messageId), isSharing);
  return null;
}
function StateProbe() {
  mockStateRender(useChatShareSelectionState());
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
      <ChatShareSelectionProvider sessionId="session" initialMessageId="answer">
        <SelectionProbe ref={selection} />
        <MessageSelectionProbe messageId="answer" />
        <MessageSelectionProbe messageId="question" />
        <StateProbe />
        <ActionsProbe />
      </ChatShareSelectionProvider>,
    );
  });
});
afterEach(() => act(() => renderer.unmount()));

test('preselects the clicked answer but opens the export only on confirmation', () => {
  expect(selection.current!.selectedCount).toBe(1);
  expect(mockShareChat).not.toHaveBeenCalled();
  act(() => selection.current!.toggleMessage('question'));
  act(() => selection.current!.confirmSelection());
  expect(mockShareChat).toHaveBeenCalledWith(['answer', 'question']);
});

test('an empty selection cannot be confirmed', () => {
  act(() => selection.current!.toggleMessage('answer'));
  act(() => selection.current!.confirmSelection());
  expect(selection.current!.selectedCount).toBe(0);
  expect(mockShareChat).not.toHaveBeenCalled();
});

test('losing focus cancels pending reads but preserves selection on return from preview', () => {
  act(() => selection.current!.toggleMessage('question'));
  const blur = mockFocusEffect();
  act(blur);
  expect(mockCancelShare).toHaveBeenCalledTimes(1);
  mockFocusEffect();
  expect(selection.current!.selectedCount).toBe(2);
  act(() => selection.current!.confirmSelection());
  expect(mockShareChat).toHaveBeenCalledWith(['answer', 'question']);
});

test('a toggle updates only its row and count, leaving state and actions consumers stable', () => {
  mockMessageRender.mockClear();
  mockStateRender.mockClear();
  mockActionsRender.mockClear();
  act(() => selection.current!.toggleMessage('question'));
  expect(mockMessageRender.mock.calls).toEqual([['question', true, false]]);
  expect(selection.current!.selectedCount).toBe(2);
  expect(mockStateRender).not.toHaveBeenCalled();
  expect(mockActionsRender).not.toHaveBeenCalled();
});

test('confirmation and the selection limit read changes made before React renders', () => {
  act(() => {
    selection.current!.toggleMessage('answer');
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

test('a recycled row subscribes to its current message identity', () => {
  for (const messageId of ['question', 'answer']) {
    act(() => {
      renderer.update(
        <ChatShareSelectionProvider sessionId="session" initialMessageId="answer">
          <SelectionProbe ref={selection} />
          <MessageSelectionProbe messageId={messageId} />
        </ChatShareSelectionProvider>,
      );
    });
    expect(mockMessageRender).toHaveBeenLastCalledWith(messageId, messageId === 'answer', false);
  }
});
