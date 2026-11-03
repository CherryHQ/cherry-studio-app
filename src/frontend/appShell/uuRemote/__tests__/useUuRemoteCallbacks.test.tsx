import { clearInitialURL, getLinkingURL } from 'expo-linking';
import { StrictMode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { UuRemoteModule, UuRemoteResult } from '@/shared/contracts/uuRemote';

import { redirectSystemPath, uuRemoteCallbacks } from '../nativeIntent';
import { useUuRemoteCallbacks } from '../useUuRemoteCallbacks';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { scheme: 'cherrystudio-dev' } },
}));
jest.mock('expo-linking', () => ({ clearInitialURL: jest.fn(), getLinkingURL: jest.fn() }));

const url = 'cherrystudio-dev://uu-remote/callback?request_id=one&status=success';
const result: UuRemoteResult = {
  outcome: 'opened',
  target: { page: 'chat', connectionId: 'desktop', draftId: 'draft' },
};
const receiveCallback = jest.fn<Promise<UuRemoteResult | null>, [string]>();
const remoteModule = { receiveCallback } as unknown as UuRemoteModule;
const onResult = jest.fn();
const onError = jest.fn();
let renderer: ReactTestRenderer;

function Probe({ ready = true }: { ready?: boolean }) {
  useUuRemoteCallbacks({ module: remoteModule, isReady: ready, onResult, onError });
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  receiveCallback.mockReset().mockResolvedValue(result);
  jest.mocked(getLinkingURL).mockReturnValue(url);
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  let callback = uuRemoteCallbacks.getSnapshot();
  while (callback) {
    uuRemoteCallbacks.consume(callback);
    callback = uuRemoteCallbacks.getSnapshot();
  }
});

test('warm callbacks suppress navigation, wait for readiness, and consume duplicates once', async () => {
  expect(redirectSystemPath({ path: url, initial: false })).toBeNull();
  expect(redirectSystemPath({ path: url, initial: false })).toBeNull();
  await act(async () => {
    renderer = create(<Probe ready={false} />);
  });
  expect(receiveCallback).not.toHaveBeenCalled();
  await act(async () => renderer.update(<Probe />));
  expect(receiveCallback.mock.calls).toEqual([[url]]);
  expect(onResult.mock.calls).toEqual([[result, false]]);
  expect(uuRemoteCallbacks.getSnapshot()).toBeNull();
  expect(clearInitialURL).toHaveBeenCalledTimes(1);
});

test('cold callbacks strip all parameters before routing and preserve the restore decision', async () => {
  const cold = url + '&anonymous_device_id=private-id';
  expect(redirectSystemPath({ path: cold, initial: true })).toBe('/uu-remote/callback');
  await act(async () => {
    renderer = create(<Probe />);
  });
  expect(receiveCallback).toHaveBeenCalledWith(cold);
  expect(onResult).toHaveBeenCalledWith(result, true);
});

test.each([
  '/settings',
  'cherrystudio-dev://oauth/callback?code=value',
  'cherrystudio://uu-remote/callback',
  'malformed',
])('leaves unrelated links unchanged: %s', (path) => {
  expect(redirectSystemPath({ path, initial: false })).toBe(path);
  expect(uuRemoteCallbacks.getSnapshot()).toBeNull();
});

test('retains a one-shot result across shell unmount and Strict Mode subscriptions', async () => {
  let resolve!: (value: UuRemoteResult) => void;
  receiveCallback.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  redirectSystemPath({ path: url, initial: false });
  await act(async () => {
    renderer = create(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
  });
  await act(async () => renderer.unmount());
  await act(async () => resolve(result));
  expect(onResult).not.toHaveBeenCalled();
  await act(async () => {
    renderer = create(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
  });
  expect(receiveCallback).toHaveBeenCalledTimes(1);
  expect(onResult.mock.calls).toEqual([[result, false]]);
});

test('invalid cold callbacks settle without a target and storage errors do not block later callbacks', async () => {
  receiveCallback.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('storage'));
  redirectSystemPath({ path: url, initial: true });
  redirectSystemPath({ path: url.replace('one', 'two'), initial: false });
  await act(async () => {
    renderer = create(<Probe />);
  });
  expect(onResult.mock.calls).toEqual([[null, true]]);
  expect(onError).toHaveBeenCalledWith(expect.any(Error), false);
  expect(uuRemoteCallbacks.getSnapshot()).toBeNull();
});

test('does not clear a newer unrelated link while finishing an older UU callback', async () => {
  jest.mocked(getLinkingURL).mockReturnValue('cherrystudio-dev://oauth/callback?code=new');
  redirectSystemPath({ path: url, initial: false });
  await act(async () => {
    renderer = create(<Probe />);
  });
  expect(onResult).toHaveBeenCalledWith(result, false);
  expect(clearInitialURL).not.toHaveBeenCalled();
});
