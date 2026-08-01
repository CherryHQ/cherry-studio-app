import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import type { ApiClient } from '@cherrystudio/universal/data/api/types';
import type { FileUIPart } from '@cherrystudio/universal/data/types/message';

import { useFilePartUri } from '../useFilePartUri';

jest.mock('expo-file-system', () => {
  const files = new Set<string>();

  class MockFile {
    readonly uri: string;

    constructor(uri: string) {
      this.uri = uri;
    }

    get exists() {
      return files.has(this.uri);
    }
  }

  return { File: MockFile, testState: { files } };
});

const { testState } = jest.requireMock<{ testState: { files: Set<string> } }>('expo-file-system');
const get = jest.fn();
const dataApi = {
  delete: jest.fn(),
  get,
  patch: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
} as unknown as ApiClient;

let current: ReturnType<typeof useFilePartUri> | undefined;
let queryClient: QueryClient;
let renderer: ReactTestRenderer | undefined;

function Probe({ part }: { part: FileUIPart }) {
  const result = useFilePartUri(part);
  useEffect(() => {
    current = result;
  }, [result]);
  return null;
}

async function render(part: FileUIPart) {
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={queryClient}>
        <DataApiProvider dataApi={dataApi}>
          <Probe part={part} />
        </DataApiProvider>
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useFilePartUri', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    current = undefined;
    testState.files.clear();
    queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false } },
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    queryClient.clear();
  });

  test('uses the URI rebuilt from a managed file entry', async () => {
    get.mockResolvedValueOnce('file:///new-sandbox/files/entry.png');

    await render(managedFilePart('file:///old-sandbox/image.png'));

    expect(get).toHaveBeenCalledWith('/files/entry-1/renderable-uri', { query: undefined });
    expect(current).toMatchObject({ isLoading: false, uri: 'file:///new-sandbox/files/entry.png' });
  });

  test('does not reuse a stale persisted URL when the managed entry is unavailable', async () => {
    testState.files.add('file:///legacy/image.png');
    get.mockResolvedValueOnce(null);

    await render(managedFilePart('file:///legacy/image.png'));

    expect(current).toMatchObject({ isLoading: false, uri: undefined });
  });

  test('checks an unmanaged local URI on device storage', async () => {
    testState.files.add('file:///legacy/image.png');

    await render(filePart('file:///legacy/image.png'));

    expect(get).not.toHaveBeenCalled();
    expect(current).toMatchObject({ isLoading: false, uri: 'file:///legacy/image.png' });
  });
});

function managedFilePart(url: string): FileUIPart {
  return {
    ...filePart(url),
    providerMetadata: { cherry: { fileEntryId: 'entry-1' } },
  };
}

function filePart(url: string): FileUIPart {
  return {
    filename: 'image.png',
    mediaType: 'image/png',
    type: 'file',
    url,
  };
}
