import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { UuRemoteResult } from '@/shared/contracts/uuRemote';

import type { useUuRemoteCallbacks } from '../useUuRemoteCallbacks';
import { UuRemoteCallbackBridge } from '../UuRemoteCallbackBridge';

const mockReplace = jest.fn();
const mockRouter = { replace: mockReplace };
const mockOpen = jest.fn(async () => {});
const mockReportError = jest.fn();
const mockInvalidate = jest.fn(async () => {});
let mockCoverVisible = false;
let mockCallbacks: Parameters<typeof useUuRemoteCallbacks>[0];

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useRootNavigationState: () => ({ key: 'root' }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({}),
  queryKeys: { uuRemote: { binding: (id: string) => ['uu', id] } },
}));
jest.mock('@/frontend/appShell/navigation/chat', () => ({
  remoteChatHref: (params: unknown) => ({ pathname: '/remote', params }),
}));
jest.mock('@/frontend/appShell/startup', () => ({
  useStartupCoverVisible: () => mockCoverVisible,
}));
jest.mock('../useUuRemoteAction', () => ({
  useUuRemoteAction: () => ({ open: mockOpen, reportError: mockReportError }),
}));
jest.mock('../useUuRemoteCallbacks', () => ({
  useUuRemoteCallbacks: (options: typeof mockCallbacks) => {
    mockCallbacks = options;
  },
}));

const target = { page: 'chat', connectionId: 'desktop', draftId: 'unsent-draft' } as const;
let renderer: ReactTestRenderer;
beforeEach(async () => {
  jest.clearAllMocks();
  mockCoverVisible = false;
  await act(async () => {
    renderer = create(<UuRemoteCallbackBridge />);
  });
});
afterEach(async () => {
  await act(async () => renderer.unmount());
});

test.each(['opened', 'cancelled'] as const)(
  'a warm %s callback does not navigate or relaunch UU',
  async (outcome) => {
    await act(async () => mockCallbacks.onResult({ target, outcome }, false));
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockReportError).not.toHaveBeenCalled();
  },
);

test('a cold callback restores the validated draft directly, while an invalid callback falls back home', async () => {
  await act(async () => mockCallbacks.onResult({ target, outcome: 'opened' }, true));
  expect(mockReplace.mock.calls).toEqual([
    [{ pathname: '/remote', params: { connectionId: 'desktop', draftId: 'unsent-draft' } }],
  ]);
  await act(async () => mockCallbacks.onResult(null, true));
  expect(mockReplace).toHaveBeenLastCalledWith('/');
});

test('binding continues once with the saved mode after the cold startup cover closes', async () => {
  mockCoverVisible = true;
  await act(async () => renderer.update(<UuRemoteCallbackBridge />));
  await act(async () =>
    mockCallbacks.onResult({ target, outcome: 'bound', mode: 'fullscreen' }, true),
  );
  expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['uu', 'desktop'] });
  expect(mockOpen).not.toHaveBeenCalled();
  mockCoverVisible = false;
  await act(async () => renderer.update(<UuRemoteCallbackBridge />));
  expect(mockOpen.mock.calls).toEqual([[target, 'fullscreen']]);
  await act(async () => renderer.update(<UuRemoteCallbackBridge />));
  expect(mockOpen).toHaveBeenCalledTimes(1);
});

test('a warm binding continues immediately and is not repeated when the cover changes', async () => {
  await act(async () => mockCallbacks.onResult({ target, outcome: 'bound', mode: 'pip' }, false));
  expect(mockOpen.mock.calls).toEqual([[target, 'pip']]);
  mockCoverVisible = true;
  await act(async () => renderer.update(<UuRemoteCallbackBridge />));
  mockCoverVisible = false;
  await act(async () => renderer.update(<UuRemoteCallbackBridge />));
  expect(mockOpen).toHaveBeenCalledTimes(1);
  expect(mockReplace).not.toHaveBeenCalled();
});

test('an invalid binding refreshes its display and reports failure without leaving the current page', async () => {
  const failure: UuRemoteResult = { target, outcome: 'failed', reason: 'binding-invalid' };
  await act(async () => mockCallbacks.onResult(failure, false));
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['uu', 'desktop'] });
  expect(mockReportError).toHaveBeenCalledWith(
    expect.objectContaining({ reason: 'binding-invalid' }),
    target,
  );
});
