import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ConversationMessage, ResourceValue } from '@/frontend/appShell/conversation';

import { ConversationMessageContent } from '../ConversationMessageContent';

const mockModule = { open: jest.fn() };
let mockSheetContent: ReactNode;

jest.mock('@/frontend/data', () => ({ useBackendModule: () => mockModule }));
jest.mock('@/frontend/components/Message', () => ({
  getBuiltInToolDisplay: () => undefined,
  ToolRendererProvider: ({ renderTool }: { renderTool(part: { toolCallId: string }): ReactNode }) =>
    renderTool({ toolCallId: 'call' }),
}));
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

const readDetail = jest.fn<Promise<ResourceValue>, [AbortSignal]>();
const message = {
  tools: [
    {
      key: 'call',
      title: 'read_file',
      state: 'completed',
      output: { kind: 'deferred', key: 'output-ref', read: readDetail },
    },
  ],
} as unknown as ConversationMessage;

describe('remote tool sheet content', () => {
  let row: ReactTestRenderer | undefined;
  let sheet: ReactTestRenderer | undefined;
  let queryClient: QueryClient;

  beforeEach(() => {
    readDetail.mockReset();
    mockModule.open.mockReset();
    mockSheetContent = undefined;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
          <ConversationMessageContent message={message}>
            <></>
          </ConversationMessageContent>
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
    readDetail.mockResolvedValue({ kind: 'text', text: 'File contents', complete: true });
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
    expect(readDetail).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it('cancels an unfinished detail read when the sheet closes', async () => {
    let signal: AbortSignal | undefined;
    readDetail.mockImplementation((requestSignal: AbortSignal) => {
      signal = requestSignal;
      return new Promise<ResourceValue>(() => {});
    });
    await mountRow();
    await openSheet();
    expect(signal?.aborted).toBe(false);

    await act(async () => sheet!.unmount());
    sheet = undefined;
    expect(signal?.aborted).toBe(true);
  });
});
