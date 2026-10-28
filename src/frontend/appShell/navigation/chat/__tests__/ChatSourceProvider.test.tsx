import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatSourceProvider, useChatSource } from '../ChatSourceProvider';

let mockPathname = '/';
let mockParams: Record<string, string> = {};
let snapshot: ReturnType<typeof useChatSource>;

jest.mock('expo-router', () => ({
  useGlobalSearchParams: () => mockParams,
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: jest.fn(), setParams: jest.fn() }),
}));
jest.mock('@/frontend/data/hooks', () => ({
  usePreference: () => ['sessions', jest.fn()],
}));
jest.mock('@/frontend/hooks/useDesktopConnections', () => ({
  useDesktopConnections: () => ({ connections: [] }),
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
});
