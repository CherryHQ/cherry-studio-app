import { useLayoutEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createChatComposerHandoff } from '@/frontend/appShell/navigation/chat';
import type { SystemAction, SystemEntryModule } from '@/shared/contracts';

import { SystemEntryBridge, useSystemShareDestination } from '../SystemEntryBridge';
import { useSystemEntryClaims } from '../useSystemEntryClaims';

let mockPathname = '/';
let mockNavigation: { key: string } | undefined;
let mockAgents: { id: string }[];
const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  dismissTo: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
};
let destination: ReturnType<typeof useSystemShareDestination>;

const mockToast = { show: jest.fn() };
const pendingListeners = new Set<() => void>();
const appStateListeners = new Set<(state: AppStateStatus) => void>();
const claims: { resolve(action: SystemAction | null): void }[] = [];
const mockModule: SystemEntryModule = {
  claimNext: jest.fn(
    () =>
      new Promise<SystemAction | null>((resolve) => {
        claims.push({ resolve });
      }),
  ),
  isReceiving: () => false,
  subscribeReceiving: () => () => {},
  subscribePending(listener) {
    pendingListeners.add(listener);
    return () => pendingListeners.delete(listener);
  },
};

jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRootNavigationState: () => mockNavigation,
  useRouter: () => mockRouter,
}));

jest.mock('@cherrystudio/ui/components', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/data', () => ({ useBackendModule: () => mockModule }));
jest.mock('@/frontend/hooks/agent', () => ({
  useAgentsApi: () => ({ agents: mockAgents }),
}));
jest.mock('@/frontend/appShell/navigation/chat', () => ({
  ...jest.requireActual('@/frontend/appShell/navigation/chat/chatRoute'),
  createChatComposerHandoff: jest.fn(() => 'share-handoff'),
}));
jest.mock('../useSystemEntryClaims', () => ({
  useSystemEntryClaims: jest.fn(jest.requireActual('../useSystemEntryClaims').useSystemEntryClaims),
}));

const share = (text: string): SystemAction => ({
  files: [
    {
      fileEntryId: 'image-entry',
      mediaType: 'image/png',
      name: 'photo.png',
      size: 100,
      uri: 'file:///shared/photo.png',
    },
    {
      fileEntryId: 'pdf-entry',
      mediaType: 'application/pdf',
      name: 'notes.pdf',
      size: 200,
      uri: 'file:///shared/notes.pdf',
    },
  ],
  kind: 'share.receive',
  text,
});
let renderer: ReactTestRenderer | undefined;

function Probe() {
  const value = useSystemShareDestination();
  useLayoutEffect(() => {
    destination = value;
  }, [value]);
  return null;
}

function render() {
  act(() => {
    const element = (
      <SystemEntryBridge>
        <Probe />
      </SystemEntryBridge>
    );
    if (renderer) renderer.update(element);
    else renderer = create(element);
  });
}

function enterDestination() {
  mockPathname = '/share-destination';
  render();
}

function claimsProps() {
  return jest.mocked(useSystemEntryClaims).mock.calls.at(-1)![0];
}

async function settle(index: number, action: SystemAction | null) {
  await act(async () => claims[index].resolve(action));
}

function expectNoNavigation() {
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(mockRouter.dismissTo).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  claims.length = 0;
  pendingListeners.clear();
  appStateListeners.clear();
  mockPathname = '/';
  mockNavigation = { key: 'root' };
  mockAgents = [{ id: 'default-agent' }];
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  });
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  jest.restoreAllMocks();
});

it('opens the destination page without modifying a composer or putting content in the route', async () => {
  render();
  await settle(0, share('Shared text'));

  expect(mockRouter.push.mock.calls).toEqual([['/share-destination']]);
  expect(destination.isPending).toBe(true);
  expect(createChatComposerHandoff).not.toHaveBeenCalled();
  expect(mockRouter.dismissTo).not.toHaveBeenCalled();
});

it.each([
  { kind: 'draft' as const, agentId: 'chosen-agent' },
  { kind: 'session' as const, sessionId: 'chosen-session' },
])('hands shared text and attachments to the chosen $kind only once', async (target) => {
  render();
  await settle(0, share('Shared text'));
  enterDestination();
  act(() => {
    destination.select(target);
    destination.select(target);
  });

  expect(createChatComposerHandoff).toHaveBeenCalledTimes(1);
  expect(createChatComposerHandoff).toHaveBeenCalledWith({
    attachments: [
      { ...share('').files[0], id: 'file-entry:image-entry', kind: 'image', status: 'ready' },
      { ...share('').files[1], id: 'file-entry:pdf-entry', kind: 'file', status: 'ready' },
    ],
    draft: 'Shared text',
  });
  expect(mockRouter.dismissTo.mock.calls).toEqual([
    [
      {
        pathname: '/',
        params: {
          agentId: target.kind === 'draft' ? target.agentId : undefined,
          composerHandoff: 'share-handoff',
          selectionHandoff: undefined,
          workspaceDraftId: undefined,
          sessionId: target.kind === 'session' ? target.sessionId : undefined,
          messageId: undefined,
          messageRequestId: undefined,
        },
      },
    ],
  ]);
});

it('declines same-pass shares without replacing the share being chosen', () => {
  render();
  const { deliver } = claimsProps();
  act(() => {
    expect(deliver(share('first'))).toBe(true);
    expect(deliver(share('second'))).toBe(false);
  });
  enterDestination();
  act(() => destination.select({ kind: 'draft', agentId: 'chosen-agent' }));
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
  expect(createChatComposerHandoff).toHaveBeenCalledWith(
    expect.objectContaining({ draft: 'first' }),
  );
});

it('cancels without changing the composer and does not reopen that share on foreground', async () => {
  mockPathname = '/settings';
  render();
  await settle(0, share('Cancel this share'));
  enterDestination();
  act(() => destination.cancel());
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
  expect(createChatComposerHandoff).not.toHaveBeenCalled();
  expect(mockRouter.dismissTo).not.toHaveBeenCalled();

  mockPathname = '/settings';
  render();
  expect(destination.isPending).toBe(false);
  act(() => appStateListeners.forEach((listener) => listener('active')));
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
});

it('clears a share on system back without requiring the close callback', async () => {
  render();
  await settle(0, share('Back'));
  enterDestination();
  mockPathname = '/';
  render();
  expect(destination.isPending).toBe(false);
  expect(createChatComposerHandoff).not.toHaveBeenCalled();
});

it('delivers a held claim only after the current destination page exits', async () => {
  render();
  act(() => {
    claimsProps().deliver(share('first'));
  });
  enterDestination();
  await settle(0, share('second'));
  act(() => destination.select({ kind: 'session', sessionId: 'first-session' }));
  expect(mockRouter.push).toHaveBeenCalledTimes(1);

  mockPathname = '/';
  render();
  expect(mockRouter.push).toHaveBeenCalledTimes(2);
  enterDestination();
  act(() => destination.select({ kind: 'session', sessionId: 'second-session' }));
  expect(
    jest.mocked(createChatComposerHandoff).mock.calls.map(([handoff]) => handoff.draft),
  ).toEqual(['first', 'second']);
});

it('waits without an Agent and claims once an Agent becomes available', async () => {
  mockAgents = [];
  render();
  expect(claimsProps().deliver(share('waiting'))).toBe(false);
  expect(mockModule.claimNext).not.toHaveBeenCalled();
  expectNoNavigation();

  mockAgents = [{ id: 'available-agent' }];
  render();
  await settle(0, share('waiting'));
  expect(mockRouter.push).toHaveBeenCalledWith('/share-destination');
});

it('declines delivery until root navigation is ready', () => {
  mockNavigation = undefined;
  render();
  expect(claimsProps().deliver(share('waiting'))).toBe(false);
  expect(mockModule.claimNext).not.toHaveBeenCalled();
  expectNoNavigation();
});

it('cleans up pending-share and foreground subscriptions on unmount', () => {
  render();
  act(() => renderer!.unmount());
  renderer = undefined;
  expect(pendingListeners.size).toBe(0);
  expect(appStateListeners.size).toBe(0);
});
