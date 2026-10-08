import { AppState, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { SystemAction, SystemEntryModule } from '@/shared/contracts';

import { useSystemEntryClaims } from '../useSystemEntryClaims';

type Props = Parameters<typeof useSystemEntryClaims>[0];

const appStateListeners = new Set<(state: AppStateStatus) => void>();
const pendingListeners = new Set<() => void>();
const claims: { resolve(action: SystemAction | null): void; reject(error: Error): void }[] = [];
const claimNext = jest.fn(
  () =>
    new Promise<SystemAction | null>((resolve, reject) => {
      claims.push({ reject, resolve });
    }),
);
const module: SystemEntryModule = {
  claimNext,
  subscribePending(listener) {
    pendingListeners.add(listener);
    return () => pendingListeners.delete(listener);
  },
};
const share = (text: string): SystemAction => ({ files: [], kind: 'share.receive', text });

let renderer: ReactTestRenderer | undefined;

function Probe(props: Props) {
  useSystemEntryClaims(props);
  return null;
}

function render(props: Partial<Props> & Pick<Props, 'deliver'>) {
  const element = <Probe isReady module={module} onFailure={jest.fn()} {...props} />;
  act(() => {
    if (renderer) renderer.update(element);
    else renderer = create(element);
  });
}

async function settle(index: number, action: SystemAction | null) {
  await act(async () => {
    claims[index].resolve(action);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  claims.length = 0;
  pendingListeners.clear();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  });
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  appStateListeners.clear();
});

it('delivers a claim through the latest render after its effect was replaced', async () => {
  const first = jest.fn(() => true);
  const latest = jest.fn(() => true);
  render({ deliver: first });
  expect(claimNext).toHaveBeenCalledTimes(1);

  // A new effect generation starts while the first claim is still importing.
  const replacementModule = { ...module };
  render({ deliver: latest, module: replacementModule });
  await settle(0, share('hello'));

  expect(first).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledWith(share('hello'));
});

it('runs a claim requested during an in-flight claim once that claim settles', async () => {
  const deliver = jest.fn((_action: SystemAction) => true);
  render({ deliver });
  act(() => pendingListeners.forEach((listener) => listener()));
  expect(claimNext).toHaveBeenCalledTimes(1);

  await settle(0, share('first'));

  expect(claimNext).toHaveBeenCalledTimes(2);
  await settle(1, share('second'));
  expect(deliver.mock.calls.map(([action]) => action.text)).toEqual(['first', 'second']);
});

it('holds a claimed share while the shell cannot open it, then delivers it when ready', async () => {
  const deliver = jest.fn(() => true);
  render({ deliver });
  render({ deliver, isReady: false });

  await settle(0, share('waiting'));
  expect(deliver).not.toHaveBeenCalled();

  render({ deliver, isReady: true });
  expect(deliver).toHaveBeenCalledWith(share('waiting'));
});

it('keeps a share that delivery declines for the next ready pass', async () => {
  const deliver = jest.fn(() => false);
  render({ deliver });
  await settle(0, share('declined'));
  expect(deliver).toHaveBeenCalledTimes(1);

  render({ deliver: jest.fn(() => true), isReady: false });
  const accept = jest.fn(() => true);
  render({ deliver: accept, isReady: true });
  expect(accept).toHaveBeenCalledWith(share('declined'));
});

it('reports a failed import and claims again only when asked', async () => {
  const onFailure = jest.fn();
  render({ deliver: jest.fn(() => true), onFailure });

  await act(async () => {
    claims[0].reject(new Error('import failed'));
  });

  expect(onFailure).toHaveBeenCalledTimes(1);
  expect(claimNext).toHaveBeenCalledTimes(1);
  act(() => appStateListeners.forEach((listener) => listener('active')));
  expect(claimNext).toHaveBeenCalledTimes(2);
});
