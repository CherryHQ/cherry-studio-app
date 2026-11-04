import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createChatComposerHandoff } from '@/frontend/appShell/navigation/chat';
import type { SystemAction } from '@/shared/contracts';

import { SystemEntryBridge, useSystemShareDestination } from '../SystemEntryBridge';
import { useSystemEntryClaims } from '../useSystemEntryClaims';

let mockPathname = '/';
let mockNavigation: { key: string } | undefined;
const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  dismissTo: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
};
let destination: ReturnType<typeof useSystemShareDestination>;

jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRootNavigationState: () => mockNavigation,
  useRouter: () => mockRouter,
}));

jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: jest.fn() } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/data', () => ({ useBackendModule: () => ({}) }));
jest.mock('@/frontend/appShell/navigation/chat', () => ({
  ...jest.requireActual('@/frontend/appShell/navigation/chat/chatRoute'),
  createChatComposerHandoff: jest.fn(() => 'share-handoff'),
}));
jest.mock('../useSystemEntryClaims', () => ({
  useSystemEntryClaims: jest.fn(),
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

function deliver(action: SystemAction) {
  let accepted = false;
  act(() => {
    accepted = claimsProps().deliver(action);
  });
  return accepted;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = '/';
  mockNavigation = { key: 'root' };
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

it('opens the destination page without modifying a composer or putting content in the route', () => {
  render();
  expect(claimsProps().isReady).toBe(true);
  expect(deliver(share('Shared text'))).toBe(true);

  expect(mockRouter.push.mock.calls).toEqual([['/share-destination']]);
  expect(destination.isPending).toBe(true);
  expect(claimsProps().isReady).toBe(false);
  expect(createChatComposerHandoff).not.toHaveBeenCalled();
  expect(mockRouter.dismissTo).not.toHaveBeenCalled();
});

it.each([
  { kind: 'draft' as const, agentId: 'chosen-agent' },
  { kind: 'session' as const, sessionId: 'chosen-session' },
])('hands shared text and attachments to the chosen $kind only once', (target) => {
  render();
  deliver(share('Shared text'));
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
  expect(mockRouter.dismissTo).toHaveBeenCalledWith({
    pathname: '/',
    params: expect.objectContaining({
      ...(target.kind === 'draft' ? { agentId: target.agentId } : { sessionId: target.sessionId }),
      composerHandoff: 'share-handoff',
    }),
  });
});

it('admits one share and stays unavailable until the destination page exits', () => {
  render();
  const receive = claimsProps().deliver;
  act(() => {
    expect(receive(share('first'))).toBe(true);
    expect(receive(share('second'))).toBe(false);
  });
  enterDestination();
  act(() => destination.select({ kind: 'draft', agentId: 'chosen-agent' }));
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
  expect(createChatComposerHandoff).toHaveBeenCalledWith(
    expect.objectContaining({ draft: 'first' }),
  );
  expect(claimsProps().isReady).toBe(false);
  expect(claimsProps().deliver(share('second'))).toBe(false);
  mockPathname = '/';
  render();
  expect(claimsProps().isReady).toBe(true);
  expect(deliver(share('second'))).toBe(true);
});

it.each(['close', 'system back'])(
  'discards a share on %s and restores delivery readiness',
  (exit) => {
    mockPathname = '/settings';
    render();
    deliver(share('Cancel this share'));
    enterDestination();
    if (exit === 'close') {
      act(() => destination.cancel());
      expect(mockRouter.back).toHaveBeenCalledTimes(1);
    }

    mockPathname = '/settings';
    render();
    expect(destination.isPending).toBe(false);
    expect(claimsProps().isReady).toBe(true);
    expect(createChatComposerHandoff).not.toHaveBeenCalled();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  },
);

it('declines delivery until root navigation is ready', () => {
  mockNavigation = undefined;
  render();
  expect(claimsProps().isReady).toBe(false);
  expect(deliver(share('waiting'))).toBe(false);
  expect(mockRouter.push).not.toHaveBeenCalled();
});
