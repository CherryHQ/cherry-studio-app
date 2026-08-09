import type { FileUIPart } from '@cherrystudio/universal/data/types/message';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

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
        <Probe part={part} />
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

  test('checks an unmanaged local URI on device storage', async () => {
    testState.files.add('file:///legacy/image.png');

    await render(filePart('file:///legacy/image.png'));

    expect(current).toMatchObject({ isLoading: false, uri: 'file:///legacy/image.png' });
  });
});

function filePart(url: string): FileUIPart {
  return {
    filename: 'image.png',
    mediaType: 'image/png',
    type: 'file',
    url,
  };
}
