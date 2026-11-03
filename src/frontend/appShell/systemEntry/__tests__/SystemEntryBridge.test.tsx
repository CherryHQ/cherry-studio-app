import type { ComponentProps } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createChatComposerHandoff } from '@/frontend/appShell/navigation/chat';
import type { SystemAction, SystemEntryModule } from '@/shared/contracts';

import { ShareDestinationSheet } from '../ShareDestinationSheet';
import { SystemEntryBridge } from '../SystemEntryBridge';
import { useSystemEntryClaims } from '../useSystemEntryClaims';

type SheetProps = ComponentProps<typeof ShareDestinationSheet>;

let mockSheetProps: SheetProps | undefined;
let mockPathname = '/';
let mockParams: { agentId?: string; sessionId?: string } = {};
let mockNavigation: { key: string } | undefined;
let mockAgents: { id: string }[];
let mockSessionAgentId: string | undefined;
const mockRouter = { dismissTo: jest.fn(), setParams: jest.fn() };
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
  useGlobalSearchParams: () => mockParams,
  usePathname: () => mockPathname,
  useRootNavigationState: () => mockNavigation,
  useRouter: () => mockRouter,
}));

jest.mock('@cherrystudio/ui/components', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/data', () => ({ useBackendModule: () => mockModule }));
jest.mock('@/frontend/hooks/agent', () => ({
  useAgentSession: () => ({
    data: mockSessionAgentId ? { agentId: mockSessionAgentId } : undefined,
  }),
  useAgentsApi: () => ({ agents: mockAgents }),
}));
jest.mock('@/frontend/appShell/navigation/chat', () => ({
  ...jest.requireActual('@/frontend/appShell/navigation/chat/chatRoute'),
  createChatComposerHandoff: jest.fn(() => 'share-handoff'),
}));
jest.mock('../ShareDestinationSheet', () => ({
  ShareDestinationSheet: (props: SheetProps) => {
    mockSheetProps = props;
    return null;
  },
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

function render() {
  act(() => {
    if (renderer) renderer.update(<SystemEntryBridge />);
    else renderer = create(<SystemEntryBridge />);
  });
}

function sheet(): SheetProps {
  if (!mockSheetProps) throw new Error('ShareDestinationSheet has not rendered');
  return mockSheetProps;
}

function claimsProps() {
  return jest.mocked(useSystemEntryClaims).mock.calls.at(-1)![0];
}

async function settle(index: number, action: SystemAction | null) {
  await act(async () => claims[index].resolve(action));
}

function expectNoNavigation() {
  expect(mockRouter.setParams).not.toHaveBeenCalled();
  expect(mockRouter.dismissTo).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSheetProps = undefined;
  claims.length = 0;
  pendingListeners.clear();
  appStateListeners.clear();
  mockPathname = '/';
  mockParams = {};
  mockNavigation = { key: 'root' };
  mockAgents = [{ id: 'default-agent' }];
  mockSessionAgentId = undefined;
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

it('opens destination selection for a claimed share without navigating or seeding a draft', async () => {
  render();
  expect(sheet().open).toBe(false);
  await settle(0, share('Shared text'));

  expect(sheet().open).toBe(true);
  expect(sheet().defaultAgentId).toBe('default-agent');
  expectNoNavigation();
  expect(createChatComposerHandoff).not.toHaveBeenCalled();
});

it.each([
  ['/', { kind: 'session', sessionId: 'existing-session' }],
  ['/settings', { kind: 'session', sessionId: 'existing-session' }],
  ['/', { kind: 'draft', agentId: 'selected-agent' }],
  ['/settings', { kind: 'draft', agentId: 'selected-agent' }],
] satisfies [string, Parameters<SheetProps['onSelect']>[0]][])(
  'hands the unsent share to the selected destination from %s: %j',
  async (pathname, destination) => {
    mockPathname = pathname;
    render();
    await settle(0, share('Shared text'));
    act(() => sheet().onSelect(destination));

    const params = {
      agentId: destination.kind === 'draft' ? destination.agentId : undefined,
      composerHandoff: 'share-handoff',
      selectionHandoff: undefined,
      workspaceDraftId: undefined,
      sessionId: destination.kind === 'session' ? destination.sessionId : undefined,
      messageId: undefined,
      messageRequestId: undefined,
    };
    if (pathname === '/') {
      expect(mockRouter.setParams.mock.calls).toEqual([[params]]);
      expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    } else {
      expect(mockRouter.dismissTo.mock.calls).toEqual([[{ params, pathname: '/' }]]);
      expect(mockRouter.setParams).not.toHaveBeenCalled();
    }
    expect(createChatComposerHandoff).toHaveBeenCalledTimes(1);
    expect(createChatComposerHandoff).toHaveBeenCalledWith({
      attachments: [
        { ...share('').files[0], id: 'file-entry:image-entry', kind: 'image', status: 'ready' },
        { ...share('').files[1], id: 'file-entry:pdf-entry', kind: 'file', status: 'ready' },
      ],
      draft: 'Shared text',
    });
    expect(sheet().open).toBe(false);
    expect(claimsProps().isReady).toBe(true);
  },
);

it.each(['new share', 'foreground'] as const)(
  'retains a cancelled share and retries on %s without changing routes or drafts',
  async (retry) => {
    render();
    await settle(0, share('Keep this share'));
    act(() => sheet().onCancel());

    expect(sheet().open).toBe(false);
    expectNoNavigation();
    expect(createChatComposerHandoff).not.toHaveBeenCalled();
    act(() => {
      if (retry === 'new share') pendingListeners.forEach((listener) => listener());
      else appStateListeners.forEach((listener) => listener('active'));
    });

    expect(sheet().open).toBe(true);
    expectNoNavigation();
    expect(createChatComposerHandoff).not.toHaveBeenCalled();
    expect(mockModule.claimNext).toHaveBeenCalledTimes(1);
    act(() => sheet().onSelect({ kind: 'draft', agentId: 'default-agent' }));
    expect(createChatComposerHandoff).toHaveBeenCalledWith(
      expect.objectContaining({ draft: 'Keep this share', attachments: expect.any(Array) }),
    );
    expect(jest.mocked(createChatComposerHandoff).mock.calls.at(-1)![0].attachments).toMatchObject(
      share('').files,
    );
  },
);

it('declines subsequent deliveries in the same pass without overwriting the pending share', () => {
  render();
  const { deliver } = claimsProps();
  act(() => {
    expect(deliver(share('first'))).toBe(true);
    expect(deliver(share('second'))).toBe(false);
    expect(deliver(share('third'))).toBe(false);
  });
  expect(claimsProps().isReady).toBe(false);
  act(() => sheet().onCancel());
  act(() => {
    expect(claimsProps().deliver(share('fourth'))).toBe(false);
  });
  expect(sheet().open).toBe(true);
  act(() => sheet().onSelect({ kind: 'draft', agentId: 'default-agent' }));
  expect(createChatComposerHandoff).toHaveBeenCalledWith(
    expect.objectContaining({ draft: 'first' }),
  );
});

it('delivers a share held by the real claims hook after the pending share is selected', async () => {
  render();
  act(() => {
    claimsProps().deliver(share('first'));
  });
  // The initial native claim completes after selection has made the shell busy.
  await settle(0, share('second'));
  act(() => sheet().onSelect({ kind: 'session', sessionId: 'session-one' }));
  expect(createChatComposerHandoff).toHaveBeenLastCalledWith(
    expect.objectContaining({ draft: 'first' }),
  );
  expect(sheet().open).toBe(true);
  act(() => sheet().onSelect({ kind: 'session', sessionId: 'session-two' }));
  expect(createChatComposerHandoff).toHaveBeenLastCalledWith(
    expect.objectContaining({ draft: 'second' }),
  );
  expect(mockRouter.setParams.mock.calls.map(([params]) => params.sessionId)).toEqual([
    'session-one',
    'session-two',
  ]);
});

it('waits without an Agent and claims the share once an Agent becomes available', async () => {
  mockAgents = [];
  render();
  expect(claimsProps().deliver(share('waiting'))).toBe(false);
  expect(sheet().open).toBe(false);
  expect(mockModule.claimNext).not.toHaveBeenCalled();
  expectNoNavigation();
  expect(createChatComposerHandoff).not.toHaveBeenCalled();

  mockAgents = [{ id: 'available-agent' }];
  render();
  await settle(0, share('waiting'));
  expect(sheet().open).toBe(true);
  expect(sheet().defaultAgentId).toBe('available-agent');
});

it.each([
  [{ agentId: 'viewed-agent' }, undefined, 'viewed-agent'],
  [{ sessionId: 'viewed-session' }, 'session-agent', 'session-agent'],
] satisfies [typeof mockParams, string | undefined, string][])(
  'defaults to the Agent in view for route %j',
  (params, sessionAgentId, expectedAgentId) => {
    mockParams = params;
    mockSessionAgentId = sessionAgentId;
    render();
    expect(sheet().defaultAgentId).toBe(expectedAgentId);
  },
);

it('declines delivery until root navigation is ready', () => {
  mockNavigation = undefined;
  render();
  expect(claimsProps().deliver(share('waiting'))).toBe(false);
  expect(sheet().open).toBe(false);
  expect(mockModule.claimNext).not.toHaveBeenCalled();
  expectNoNavigation();
});

it('cleans up retry subscriptions when unmounted with a retained share', async () => {
  render();
  await settle(0, share('retained'));
  act(() => sheet().onCancel());
  act(() => renderer!.unmount());
  renderer = undefined;
  expect(pendingListeners.size).toBe(0);
  expect(appStateListeners.size).toBe(0);
});
