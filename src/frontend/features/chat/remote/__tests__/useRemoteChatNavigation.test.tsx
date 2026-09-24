import { useEffect, useLayoutEffect, useRef } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type {
  ConversationOperation,
  RemoteConversationSource,
} from '@/frontend/appShell/conversation/remote';
import type { RemoteChatTarget } from '@/frontend/appShell/navigation/chat';

import { useRemoteChatNavigation } from '../useRemoteChatNavigation';

const mockOpen = jest.fn();
const mockReplace = jest.fn();
let mockFocused = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useIsFocused: () => mockFocused,
}));
jest.mock('@/frontend/appShell/navigation/chat', () => ({
  useChatSource: () => ({ openRemote: mockOpen }),
  conversationHref: (ref: unknown) => ref,
}));
let operations: readonly ConversationOperation[];
const source = { operations: { getSnapshot: () => operations } } as Pick<
  RemoteConversationSource,
  'operations'
>;
let navigation: ReturnType<typeof useRemoteChatNavigation>;
let renderer: ReactTestRenderer;
function Probe({ target }: { target: RemoteChatTarget }) {
  const value = useRemoteChatNavigation(target, source);
  useLayoutEffect(() => {
    navigation = value;
  }, [value]);
  return null;
}
const draft = { connectionId: 'desktop', agentId: 'a', draftId: 'draft' };
const created = {
  source: { kind: 'desktop', connectionId: 'desktop' },
  sessionId: 'created',
} as const;
async function render(target: RemoteChatTarget) {
  await act(async () => {
    if (renderer) renderer.update(<Probe target={target} />);
    else renderer = create(<Probe target={target} />);
  });
}
beforeEach(() => {
  operations = [];
  mockFocused = true;
  jest.clearAllMocks();
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined!;
});

it('retargets an unsent draft without changing its composer or desktop identity', async () => {
  await render(draft);
  const identity = navigation.identity;
  await act(async () => navigation.selectAgent('b'));
  expect(mockOpen).toHaveBeenLastCalledWith({ ...draft, agentId: 'b' });
  await render(mockOpen.mock.lastCall![0]);
  expect(navigation.identity).toBe(identity);
  expect(navigation.draftId).toBe('draft');
  expect(mockReplace).not.toHaveBeenCalled();
});

it.each(['pending', 'interrupted', 'applied', 'rejected'] as const)(
  'separates a submitted draft (%s) and rejects its late result even before route rendering',
  async (state) => {
    await render(draft);
    const oldResult = navigation.onSessionCreated;
    // Admission is newer than the rendered header.
    operations = [{ id: 'start', kind: 'start', draftId: 'draft', state } as ConversationOperation];
    await act(async () => navigation.selectAgent('b'));
    const target = mockOpen.mock.lastCall![0];
    expect(target).toMatchObject({ connectionId: 'desktop', agentId: 'b' });
    expect(target.draftId).not.toBe('draft');
    expect(oldResult(created)).toBe(false);
    await render(target);
    expect(oldResult(created)).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();
  },
);

it('selecting from an existing conversation opens a new draft instead of changing its Agent', async () => {
  await render({ connectionId: 'desktop', sessionId: 'existing' });
  await act(async () => navigation.selectAgent('b'));
  expect(mockOpen).toHaveBeenCalledWith({
    connectionId: 'desktop',
    agentId: 'b',
    draftId: expect.any(String),
  });
});

it('accepts only the current focused draft handoff and preserves its composer across creation', async () => {
  await render(draft);
  const identity = navigation.identity;
  await act(async () => {
    expect(navigation.onSessionCreated(created)).toBe(true);
  });
  expect(mockReplace).toHaveBeenCalledWith(created);
  await render({ connectionId: 'desktop', sessionId: 'created' });
  expect(navigation.identity).toBe(identity);
  const result = navigation.onSessionCreated;
  await act(async () => renderer.unmount());
  renderer = undefined!;
  expect(result(created)).toBe(false);
});

it('new chat invalidates a pending handoff synchronously', async () => {
  await render(draft);
  const result = navigation.onSessionCreated;
  await act(async () => navigation.startNewChat('a'));
  expect(result(created)).toBe(false);
  expect(mockOpen.mock.lastCall![0].draftId).not.toBe('draft');
});

it('accepts recovered creation from a child effect after mount, and ignores it while blurred', async () => {
  function Recovery({ onCreated }: { onCreated: typeof navigation.onSessionCreated }) {
    const initialResponse = useRef(onCreated);
    useEffect(() => {
      initialResponse.current(created);
    }, []);
    return null;
  }
  function RecoveringRoute() {
    const value = useRemoteChatNavigation(draft, source);
    useLayoutEffect(() => {
      navigation = value;
    }, [value]);
    return <Recovery onCreated={value.onSessionCreated} />;
  }
  await act(async () => {
    renderer = create(<RecoveringRoute />);
  });
  expect(mockReplace).toHaveBeenCalledTimes(1);
  mockFocused = false;
  await render(draft);
  expect(navigation.onSessionCreated(created)).toBe(false);
  expect(mockReplace).toHaveBeenCalledTimes(1);
});
