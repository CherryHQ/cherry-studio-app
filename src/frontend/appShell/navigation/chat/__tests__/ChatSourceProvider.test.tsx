import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatSourceProvider, useChatSource } from '../ChatSourceProvider';

let mockPathname = '/';
let mockParams: Record<string, string> = {};
let mockLocalViewMode: 'sessions' | 'agents' = 'sessions';
let mockConnections: { id: string; available: boolean }[] = [];
const mockReplace = jest.fn();
const mockSetParams = jest.fn();
const mockSetLocalViewMode = jest.fn(async (mode: 'sessions' | 'agents') => {
  mockLocalViewMode = mode;
});
let snapshot: ReturnType<typeof useChatSource>;

jest.mock('expo-router', () => ({
  useGlobalSearchParams: () => mockParams,
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockReplace, setParams: mockSetParams }),
}));
jest.mock('@/frontend/data/hooks', () => ({
  usePreference: () => [mockLocalViewMode, mockSetLocalViewMode] as const,
}));
jest.mock('@/frontend/hooks/useDesktopConnections', () => ({
  useDesktopConnections: () => ({ connections: mockConnections }),
}));

function Probe() {
  const current = useChatSource();
  useEffect(() => {
    snapshot = current;
  }, [current]);
  return null;
}

function navigate(pathname: string, params: Record<string, string>) {
  mockPathname = pathname;
  mockParams = params;
}

describe('ChatSourceProvider', () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/';
    mockParams = {};
    mockLocalViewMode = 'sessions';
    mockConnections = [];
  });

  afterEach(() => act(() => renderer.unmount()));

  function render() {
    act(() => {
      renderer = create(
        <ChatSourceProvider>
          <Probe />
        </ChatSourceProvider>,
      );
    });
  }

  function rerender() {
    act(() =>
      renderer.update(
        <ChatSourceProvider>
          <Probe />
        </ChatSourceProvider>,
      ),
    );
  }

  test('keeps the covered local chat while a page fills the content region', () => {
    navigate('/', { sessionId: 's1' });
    render();
    expect(snapshot).toMatchObject({
      isChatFocused: true,
      localChat: { kind: 'session', sessionId: 's1' },
      source: 'local',
    });

    // Plugins carries the same parameter names; they must not replace the chat identity.
    navigate('/plugins', { sessionId: 'other' });
    rerender();
    expect(snapshot).toMatchObject({
      isChatFocused: false,
      localChat: { kind: 'session', sessionId: 's1' },
      source: 'local',
    });
  });

  test('keeps a desktop source while settings fill the content region', () => {
    navigate('/remote', { connectionId: 'pc', sessionId: 'r1' });
    render();
    navigate('/settings', {});
    rerender();

    expect(snapshot.source).toBe('remote');
    expect(snapshot.remoteTarget).toMatchObject({ connectionId: 'pc', sessionId: 'r1' });
    expect(snapshot.localChat).toBeUndefined();
  });

  test('keeps a team source while settings fill the content region', () => {
    navigate('/team', { bindingId: 'ent-1', agentId: 'a1', sessionId: 't1' });
    render();
    navigate('/settings', {});
    rerender();

    expect(snapshot.source).toBe('team');
    expect(snapshot.teamTarget).toMatchObject({
      bindingId: 'ent-1',
      agentId: 'a1',
      sessionId: 't1',
    });
    expect(snapshot.localChat).toBeUndefined();
  });

  test('shares ui.sidebar.recent_view_mode across local and team while keeping remoteViewMode separate', async () => {
    navigate('/', {});
    render();
    expect(snapshot.viewMode).toBe('sessions');

    await act(async () => {
      await snapshot.setViewMode('agents');
    });
    expect(mockSetLocalViewMode).toHaveBeenCalledWith('agents');

    rerender();
    expect(snapshot.viewMode).toBe('agents');

    navigate('/team', { bindingId: 'ent-1', agentId: 'a1' });
    rerender();
    expect(snapshot.viewMode).toBe('agents');

    navigate('/remote', { connectionId: 'pc', sessionId: 'r1' });
    rerender();
    expect(snapshot.remoteViewMode).toBe('agents');
    await act(async () => {
      await snapshot.setViewMode('sessions');
    });
    expect(snapshot.remoteViewMode).toBe('sessions');
    expect(mockLocalViewMode).toBe('agents');
  });

  test('restores the most recent phone source when leaving remote via selectDevice()', () => {
    mockConnections = [{ id: 'pc', available: true }];
    navigate('/team', { bindingId: 'ent-1', sessionId: 't1' });
    render();

    act(() => snapshot.selectDevice());
    expect(mockReplace).not.toHaveBeenCalled();

    act(() => snapshot.selectDevice('pc'));
    expect(mockReplace).toHaveBeenLastCalledWith({
      pathname: '/remote',
      params: { connectionId: 'pc' },
    });

    navigate('/remote', { connectionId: 'pc', sessionId: 'r1' });
    rerender();

    act(() => snapshot.selectDevice());
    expect(mockReplace).toHaveBeenLastCalledWith({
      pathname: '/team',
      params: { bindingId: 'ent-1', agentId: undefined, sessionId: 't1' },
    });

    act(() => snapshot.openLocal({ kind: 'session', sessionId: 'l1' }));
    expect(mockReplace).toHaveBeenLastCalledWith({ pathname: '/', params: { sessionId: 'l1' } });
    navigate('/', { sessionId: 'l1' });
    rerender();

    navigate('/remote', { connectionId: 'pc', sessionId: 'r1' });
    rerender();
    act(() => snapshot.selectDevice());
    expect(mockReplace).toHaveBeenLastCalledWith({ pathname: '/', params: { sessionId: 'l1' } });
  });
});
