import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  ChatSourceProvider,
  type RemoteChatRouteParams,
} from '@/frontend/appShell/navigation/chat';

import { useRemoteChatTarget } from '../useRemoteChatTarget';

const mockRouter = { replace: jest.fn(), setParams: jest.fn() };
const mockSetPreference = jest.fn();
let mockFocused = true;
let mockLocalParams: RemoteChatRouteParams = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/remote',
  useGlobalSearchParams: () => ({}),
  useLocalSearchParams: () => mockLocalParams,
  useIsFocused: () => mockFocused,
}));
jest.mock('@/frontend/data/hooks', () => ({
  usePreference: () => ['sessions', mockSetPreference],
}));
jest.mock('@/frontend/hooks/useDesktopConnections', () => ({
  useDesktopConnections: () => ({
    connections: [
      { id: 'old-pc', status: 'paired', capabilities: ['agent'] },
      { id: 'revoked-pc', status: 'revoked', capabilities: ['assistant'] },
      { id: 'dev-pc', status: 'paired', capabilities: ['assistant'] },
    ],
  }),
}));

let renderer: ReactTestRenderer | undefined;
let target: ReturnType<typeof useRemoteChatTarget>;
function Probe() {
  const value = useRemoteChatTarget();
  useLayoutEffect(() => {
    target = value;
  }, [value]);
  return null;
}
async function render() {
  await act(async () => {
    renderer = create(
      <ChatSourceProvider>
        <Probe />
      </ChatSourceProvider>,
    );
  });
}
beforeEach(() => {
  mockFocused = true;
  mockLocalParams = {};
  jest.clearAllMocks();
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
});

it('preserves the incoming desktop and domain while global params are still empty', async () => {
  mockLocalParams = { connectionId: 'dev-pc', domain: 'assistant', sessionId: 'topic' };
  await render();
  expect(target).toMatchObject(mockLocalParams);
  expect(mockRouter.setParams).not.toHaveBeenCalled();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

it('selects a paired matching grant from the focused page without replacing other params', async () => {
  mockLocalParams = { domain: 'assistant', agentId: 'assistant', draftId: 'draft' };
  await render();
  expect(mockRouter.setParams).toHaveBeenCalledTimes(1);
  expect(mockRouter.setParams).toHaveBeenCalledWith({ connectionId: 'dev-pc' });
});

it('does not let a retained background page choose a desktop', async () => {
  mockFocused = false;
  await render();
  expect(mockRouter.setParams).not.toHaveBeenCalled();
});

it('does not choose a desktop for an unsupported domain', async () => {
  mockLocalParams = { domain: 'unknown' };
  await render();
  expect(target).toBeUndefined();
  expect(mockRouter.setParams).not.toHaveBeenCalled();
});
