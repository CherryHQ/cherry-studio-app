import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ConversationMessage, ResourceValue } from '@/frontend/appShell/conversation';

import { ConversationMessageContent, ConversationAttachments } from '../ConversationMessageContent';

const mockModule = { open: jest.fn() };
const mockOpenPreview = jest.fn();
const mockPreparePreview = jest.fn(async (_source: unknown, _signal: AbortSignal) => ({
  uri: 'file:///cache/FilePreviews/photo.png',
  release: jest.fn(),
}));
let mockSheetContent: ReactNode;

jest.mock('@/frontend/appShell/filePreview', () => ({
  openTemporaryFilePreview: (...args: unknown[]) => mockOpenPreview(...args),
  prepareTemporaryFilePreview: (source: unknown, signal: AbortSignal) =>
    mockPreparePreview(source, signal),
}));
jest.mock('@/frontend/data', () => ({ useBackendModule: () => mockModule }));
jest.mock('@/frontend/components/Message', () => ({
  MessageFileRendererProvider: ({ children }: { children: ReactNode }) => children,
  getBuiltInToolDisplay: () => undefined,
  ReadOnlyToolContent: ({ output, failed }: { output: unknown; failed?: boolean }) => {
    const { Text } = jest.requireActual('react-native');
    return (
      <Text testID="tool-content">
        {`${failed ? 'failed:' : ''}${typeof output === 'string' ? output : JSON.stringify(output)}`}
      </Text>
    );
  },
  ToolRendererProvider: ({
    children,
    renderTool,
  }: {
    children: ReactNode;
    renderTool(part: { toolCallId: string }): ReactNode;
  }) => (
    <>
      {renderTool({ toolCallId: 'call' })}
      {children}
    </>
  ),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/components/MessageDetail', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    MessageDetailText: ({ value }: { value: string }) => <Text testID="tool-content">{value}</Text>,
  };
});
jest.mock('@cherrystudio/ui/components', () => {
  const { Image, Text } = jest.requireActual('react-native');
  return {
    useToast: () => ({ toast: { show: jest.fn() } }),
    FilePreview: ({ onPress, file }: { onPress(): void; file?: { kind: string; uri: string } }) => (
      <Text testID="attachment" onPress={onPress}>
        {file?.kind === 'image' ? (
          <Image testID="image-thumbnail" source={{ uri: file.uri }} />
        ) : (
          'Attachment'
        )}
      </Text>
    ),
    BottomSheet: ({ children, onClose }: { children: ReactNode; onClose(): void }) => (
      <Text testID="attachment-sheet" onPress={onClose}>
        {children}
      </Text>
    ),
    Button: ({ children }: { children: ReactNode }) => <Text>{children}</Text>,
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
          <ConversationMessageContent messageState={message.state} tools={message.tools}>
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

it('keeps the message mounted when its first tool arrives', async () => {
  const mounts = jest.fn();
  function Body() {
    useEffect(() => mounts(), []);
    return null;
  }
  const client = new QueryClient();
  let row!: ReactTestRenderer;
  await act(async () => {
    row = create(
      <QueryClientProvider client={client}>
        <ConversationMessageContent messageState="streaming" tools={[]}>
          <Body />
        </ConversationMessageContent>
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    row.update(
      <QueryClientProvider client={client}>
        <ConversationMessageContent messageState="streaming" tools={message.tools}>
          <Body />
        </ConversationMessageContent>
      </QueryClientProvider>,
    );
  });
  expect(mounts).toHaveBeenCalledTimes(1);
  await act(async () => row.unmount());
  client.clear();
});

it('does not fetch a large attachment for history and cancels its download when preview closes', async () => {
  const client = new QueryClient();
  let signal: AbortSignal | undefined;
  const read = jest.fn((value: AbortSignal) => {
    signal = value;
    return new Promise<ResourceValue>(() => {});
  });
  let row!: ReactTestRenderer;
  await act(async () => {
    row = create(
      <QueryClientProvider client={client}>
        <ConversationAttachments
          attachments={[
            {
              key: 'file',
              name: 'large.zip',
              resource: { kind: 'deferred', key: 'attachment-ref', read },
            },
          ]}
        />
      </QueryClientProvider>,
    );
  });
  expect(read).not.toHaveBeenCalled();
  await act(async () => row.root.findByProps({ testID: 'attachment' }).props.onPress());
  expect(signal?.aborted).toBe(false);
  await act(async () => row.root.findByProps({ testID: 'attachment-sheet' }).props.onPress());
  expect(signal?.aborted).toBe(true);
  await act(async () => row.unmount());
  client.clear();
});

it('shows a remote image thumbnail and opens the same downloaded image', async () => {
  const client = new QueryClient();
  const uri = 'file:///cache/RemoteAttachments/photo.png';
  const read = jest.fn<Promise<ResourceValue>, [AbortSignal]>().mockResolvedValue({
    kind: 'file',
    uri,
    name: 'photo.png',
    mediaType: 'image/png',
    byteLength: '42',
  });
  let row!: ReactTestRenderer;
  try {
    await act(async () => {
      row = create(
        <QueryClientProvider client={client}>
          <ConversationAttachments
            attachments={[
              {
                key: 'photo',
                name: 'photo.png',
                mediaType: 'image/png',
                resource: { kind: 'deferred', key: 'photo-ref', read },
              },
            ]}
          />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(row.root.findByProps({ testID: 'image-thumbnail' }).props.source).toEqual({ uri });
    await act(async () => row.root.findByProps({ testID: 'attachment' }).props.onPress());
    expect(mockPreparePreview).toHaveBeenCalledWith(
      { uri, filename: 'photo.png', mediaType: 'image/png' },
      expect.any(AbortSignal),
    );
    expect(mockOpenPreview).toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'file:///cache/FilePreviews/photo.png' }),
    );
  } finally {
    await act(async () => row?.unmount());
    client.clear();
  }
});

it('forwards failed state to read-only tool details', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const failedMessage = {
    tools: [
      {
        key: 'call',
        title: 'web_search',
        state: 'failed',
        output: {
          kind: 'inline',
          value: { kind: 'text', text: 'Search unavailable', complete: true },
        },
      },
    ],
  } as unknown as ConversationMessage;
  let row!: ReactTestRenderer;
  let sheet!: ReactTestRenderer;
  try {
    await act(async () => {
      row = create(
        <QueryClientProvider client={client}>
          <ConversationMessageContent messageState="error" tools={failedMessage.tools}>
            <></>
          </ConversationMessageContent>
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      sheet = create(<QueryClientProvider client={client}>{mockSheetContent}</QueryClientProvider>);
    });
    expect(sheet.root.findByProps({ testID: 'tool-content' }).props.children).toBe(
      'failed:Search unavailable',
    );
  } finally {
    await act(async () => {
      sheet?.unmount();
      row?.unmount();
    });
    client.clear();
  }
});
