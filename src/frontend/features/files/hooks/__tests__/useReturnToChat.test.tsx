import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useReturnToChat } from '../useReturnToChat';

const mockSetParams = jest.fn();
const mockDismissTo = jest.fn();
let mockIsInPane = false;

jest.mock('expo-router', () => ({
  useRouter: () => ({ dismissTo: mockDismissTo, setParams: mockSetParams }),
}));
jest.mock('@/frontend/appShell/layout', () => ({
  usePaneChrome: () => (mockIsInPane ? { leadingAction: {} } : null),
}));

let returnToChat: ReturnType<typeof useReturnToChat>;
function Probe() {
  const current = useReturnToChat();
  useEffect(() => {
    returnToChat = current;
  });
  return null;
}

const target = { kind: 'session' as const, sessionId: 'session-1', selectionHandoff: 'token-1' };
let renderer: ReactTestRenderer;

beforeEach(() => {
  jest.clearAllMocks();
});
afterEach(() => act(() => renderer.unmount()));

it('updates the chat in place beside the pane, replacing every chat parameter', () => {
  mockIsInPane = true;
  act(() => {
    renderer = create(<Probe />);
  });
  returnToChat(target);
  expect(mockSetParams).toHaveBeenCalledWith(
    expect.objectContaining({
      agentId: undefined,
      selectionHandoff: 'token-1',
      sessionId: 'session-1',
    }),
  );
  expect(mockDismissTo).not.toHaveBeenCalled();
});

it('returns from a viewer page to the chat', () => {
  mockIsInPane = false;
  act(() => {
    renderer = create(<Probe />);
  });
  returnToChat(target);
  expect(mockDismissTo).toHaveBeenCalledWith({
    pathname: '/',
    params: expect.objectContaining({ selectionHandoff: 'token-1', sessionId: 'session-1' }),
  });
  expect(mockSetParams).not.toHaveBeenCalled();
});
