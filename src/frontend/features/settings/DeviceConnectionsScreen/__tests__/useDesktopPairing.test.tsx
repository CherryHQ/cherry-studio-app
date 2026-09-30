import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type EffectCallback, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data';
import type { Backend, DesktopPairingProgress } from '@/shared/contracts';
import type { PairDesktopConnectionDto } from '@/shared/data/api/schemas/desktopConnections';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

import { DesktopPairingProvider, useDesktopPairingInput } from '../DesktopPairingProvider';
import { useDesktopPairing } from '../useDesktopPairing';

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: EffectCallback) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(effect, [effect]);
  },
}));

const input: PairDesktopConnectionDto = {
  t: 'cherry-studio-pair',
  v: 2,
  name: 'Desktop',
  desktopIdentity: 'desktop',
  invitationId: 'invitation',
  invitationSecret: 'secret',
  ips: ['192.168.1.2'],
  port: 23333,
  protocolVersions: [1],
  capabilities: ['agent'],
};
const connection: DesktopConnection = {
  id: 'desktop',
  name: 'Desktop',
  status: 'paired',
  capabilities: ['agent'],
  configuredEndpoints: [],
  lastFetchedAt: null,
};
let latest: ReturnType<typeof useDesktopPairing>;
let handoff: ReturnType<typeof useDesktopPairingInput>;
function Harness({ value }: { value: PairDesktopConnectionDto | null }) {
  const pairing = useDesktopPairing(value);
  useEffect(() => {
    latest = pairing;
  }, [pairing]);
  return null;
}
function HandoffHarness() {
  const input = useDesktopPairingInput();
  useEffect(() => {
    handoff = input;
  }, [input]);
  return null;
}

describe('desktop pairing workflow', () => {
  let renderer: ReactTestRenderer;
  let client: QueryClient;
  let signal: AbortSignal;
  let report: (progress: DesktopPairingProgress) => void;
  let resolve: (connection: DesktopConnection) => void;
  let reject: (error: Error) => void;
  let pair: jest.Mock;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    pair = jest.fn((_input, abortSignal, onProgress) => {
      signal = abortSignal;
      report = onProgress;
      return new Promise<DesktopConnection>((done, fail) => {
        resolve = done;
        reject = fail;
      });
    });
  });
  afterEach(async () => {
    await act(async () => renderer?.unmount());
    client.clear();
  });
  async function mount(value: PairDesktopConnectionDto | null = input) {
    await act(async () => {
      renderer = create(
        <QueryClientProvider client={client}>
          <BackendProvider backend={{ desktopConnections: { pair } } as unknown as Backend}>
            <Harness value={value} />
          </BackendProvider>
        </QueryClientProvider>,
      );
    });
  }

  it('keeps genuine progress visible and completes only after pairing resolves', async () => {
    client.setQueryData(['/desktop-connections'], []);
    await mount();
    await act(async () => report({ stage: 'connecting' }));
    await act(async () =>
      report({ stage: 'waiting', claim: { verificationCode: '123456', expiresAt: 'later' } }),
    );
    expect(latest.progress.map((event) => event.stage)).toEqual(['connecting', 'waiting']);
    expect(latest.connection).toBeUndefined();
    await act(async () => resolve(connection));
    expect(latest.connection).toEqual(connection);
    expect(client.getQueryState(['/desktop-connections'])?.isInvalidated).toBe(true);
  });

  it('retains the failed step and cause without presenting success', async () => {
    await mount();
    await act(async () => report({ stage: 'connecting' }));
    const failure = new Error('unreachable');
    await act(async () => reject(failure));
    expect(latest.error).toBe(failure);
    expect(latest.progress).toEqual([{ stage: 'connecting' }]);
    expect(latest.connection).toBeUndefined();
  });

  it('cancels on leaving and ignores late progress and completion', async () => {
    await mount();
    await act(async () => report({ stage: 'connecting' }));
    await act(async () => renderer.unmount());
    expect(signal.aborted).toBe(true);
    await act(async () => {
      report({ stage: 'saving' });
      resolve(connection);
    });
    expect(latest.progress).toEqual([{ stage: 'connecting' }]);
    expect(latest.connection).toBeUndefined();
  });

  it('does not pair when a route is reopened without a scanned invitation', async () => {
    await mount(null);
    expect(pair).not.toHaveBeenCalled();
    expect(latest.progress).toEqual([]);
  });

  it('hands credentials between pages in memory and clears them on consumption', async () => {
    await act(async () => {
      renderer = create(
        <DesktopPairingProvider>
          <HandoffHarness />
        </DesktopPairingProvider>,
      );
    });
    expect(handoff.input).toBeNull();
    await act(async () => handoff.setInput(input));
    expect(handoff.input).toEqual(input);
    await act(async () => handoff.setInput(null));
    expect(handoff.input).toBeNull();
    await act(async () => renderer.unmount());
    await act(async () => {
      renderer = create(
        <DesktopPairingProvider>
          <HandoffHarness />
        </DesktopPairingProvider>,
      );
    });
    expect(handoff.input).toBeNull();
  });
});
