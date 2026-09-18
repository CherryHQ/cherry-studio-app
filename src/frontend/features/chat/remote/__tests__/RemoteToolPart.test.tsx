import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { RemoteAgentProvider } from '@/frontend/appShell/remoteAgent';
import type { AgentController, ControllerDetail } from '@/shared/contracts/agent/controller';

import { RemoteToolPart } from '../RemoteToolPart';

const mockModule = { open: jest.fn() };
let mockSheetContent: ReactNode;

jest.mock('@/frontend/data', () => ({ useBackendModule: () => mockModule }));
jest.mock('@/frontend/appShell/remoteAgent', () =>
  jest.requireActual('@/frontend/appShell/remoteAgent/RemoteAgentProvider'),
);
jest.mock('@/frontend/components/Message', () => ({ getBuiltInToolDisplay: () => undefined }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@cherrystudio/ui/components', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    MessagePart: {
      Tool: ({ children }: { children: ReactNode }) => {
        mockSheetContent = children;
        return null;
      },
      TextSection: ({ value }: { value: string }) => <Text testID="tool-content">{value}</Text>,
    },
    ContentState: {
      Loading: ({ title }: { title: string }) => <Text>{title}</Text>,
      Error: ({ title }: { title: string }) => <Text>{title}</Text>,
    },
  };
});

const detail: ControllerDetail = {
  id: 'reply:1',
  type: 'tool',
  name: 'read_file',
  state: 'output-available',
  fields: [{ name: 'output', resource: 'output-ref' }],
};

describe('remote tool sheet content', () => {
  let row: ReactTestRenderer | undefined;
  let sheet: ReactTestRenderer | undefined;
  let queryClient: QueryClient;
  const readDetail = jest.fn();

  beforeEach(() => {
    readDetail.mockReset();
    mockModule.open.mockReset();
    mockSheetContent = undefined;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const connection = { status: 'ready', sourceKey: 'pc:pair' };
    mockModule.open.mockResolvedValue({
      getConnection: () => connection,
      subscribeConnection: () => () => {},
      readDetail,
      dispose: jest.fn(),
    } as unknown as AgentController);
  });

  afterEach(async () => {
    await act(async () => {
      sheet?.unmount();
      row?.unmount();
    });
    sheet = undefined;
    row = undefined;
    queryClient.clear();
  });

  async function mountRow() {
    await act(async () => {
      row = create(
        <QueryClientProvider client={queryClient}>
          <RemoteAgentProvider connectionId="pc" renderFallback={() => null}>
            <RemoteToolPart detail={detail} isStreaming={false} />
          </RemoteAgentProvider>
        </QueryClientProvider>,
      );
    });
  }

  async function openSheet() {
    // The native sheet host is outside the route provider, but under the app query provider.
    await act(async () => {
      sheet = create(
        <QueryClientProvider client={queryClient}>{mockSheetContent}</QueryClientProvider>,
      );
    });
  }

  it('loads deferred details outside the route provider without fetching for the summary', async () => {
    readDetail.mockResolvedValue('File contents');
    await mountRow();
    expect(readDetail).not.toHaveBeenCalled();

    await openSheet();
    // React Query batches observer notifications on a macrotask.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(sheet!.root.findByProps({ testID: 'tool-content' }).props.children).toBe(
      'File contents',
    );
    expect(readDetail).toHaveBeenCalledTimes(1);
    expect(readDetail).toHaveBeenCalledWith('output-ref', expect.any(AbortSignal));
  });

  it('cancels an unfinished detail read when the sheet closes', async () => {
    let signal: AbortSignal | undefined;
    readDetail.mockImplementation((_resource: string, requestSignal: AbortSignal) => {
      signal = requestSignal;
      return new Promise<string>(() => {});
    });
    await mountRow();
    await openSheet();
    expect(signal?.aborted).toBe(false);

    await act(async () => sheet!.unmount());
    sheet = undefined;
    expect(signal?.aborted).toBe(true);
  });
});
