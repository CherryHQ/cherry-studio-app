import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { usePairingInvitationInput } from '../usePairingInvitationInput';

const mockGetStringAsync = jest.fn<Promise<string>, []>();
jest.mock('expo-clipboard', () => ({ getStringAsync: () => mockGetStringAsync() }));

const invitation = {
  t: 'cherry-studio-pair',
  v: 2,
  name: 'Desktop',
  desktopIdentity: 'desktop',
  invitationId: 'invitation',
  invitationSecret: 'secret',
  ips: ['192.168.1.2'],
  port: 23333,
  protocolVersions: [1],
};

const listeners = new Set<(state: AppStateStatus) => void>();
function setAppState(state: AppStateStatus) {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: state });
  for (const listener of [...listeners]) listener(state);
}

let latest: ReturnType<typeof usePairingInvitationInput>;
const onInvitation = jest.fn();
const onInvalidPaste = jest.fn();
function Harness() {
  const input = usePairingInvitationInput({
    canSubmit: () => AppState.currentState === 'active',
    onInvitation,
    onInvalidPaste,
  });
  useEffect(() => {
    latest = input;
  });
  return null;
}

let renderer: ReactTestRenderer;
beforeEach(async () => {
  jest.clearAllMocks();
  listeners.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  });
  setAppState('active');
  await act(async () => {
    renderer = create(<Harness />);
  });
});
afterEach(async () => {
  await act(async () => renderer.unmount());
});

test('an invalid camera scan leaves pasting a valid invitation available', async () => {
  await act(async () => latest.scan('not a pairing invitation'));
  expect(latest.scanInvalid).toBe(true);
  mockGetStringAsync.mockResolvedValue(JSON.stringify(invitation));
  await act(async () => latest.paste());
  expect(onInvitation).toHaveBeenCalledWith(invitation);
  expect(latest.submitted).toBe(true);
});

test('a paste resolved behind the iOS consent alert submits once the app is active again', async () => {
  mockGetStringAsync.mockImplementation(async () => {
    setAppState('inactive');
    return JSON.stringify(invitation);
  });
  let pasted: Promise<void> | undefined;
  await act(async () => {
    pasted = latest.paste();
    await Promise.resolve();
  });
  expect(onInvitation).not.toHaveBeenCalled();
  await act(async () => {
    setAppState('active');
    await pasted;
  });
  expect(onInvitation).toHaveBeenCalledTimes(1);
  expect(listeners.size).toBe(0);
});

test('clipboard content that is not an invitation reports instead of submitting', async () => {
  mockGetStringAsync.mockResolvedValue('hello');
  await act(async () => latest.paste());
  expect(onInvalidPaste).toHaveBeenCalledTimes(1);
  expect(onInvitation).not.toHaveBeenCalled();
});
