import type { Painting } from '@cherrystudio/universal/data/types/painting';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data';
import type { Backend } from '@/shared/contracts';

import { useResolvedPaintingFiles } from '../usePaintings';

jest.mock('expo-image', () => ({
  Image: { loadAsync: jest.fn() },
}));

const painting: Painting = {
  createdAt: '2026-08-11T00:00:00.000Z',
  files: { input: [], output: ['output-1'] },
  id: 'painting-1',
  modelId: 'cherryin::qwen-image',
  orderKey: 'painting-1',
  prompt: 'draw a miniature city',
  providerId: 'cherryin',
  updatedAt: '2026-08-11T00:01:00.000Z',
};

const resolveFiles = jest.fn(async () => ({
  inputs: [],
  outputs: [
    {
      entry: {
        ext: 'png',
        id: 'output-1',
        name: 'generated',
        origin: 'internal',
        size: 1024,
      },
      uri: 'file:///generated.png',
    },
  ],
}));

const backend = { paintings: { resolveFiles } } as unknown as Backend;
let query: ReturnType<typeof useResolvedPaintingFiles> | undefined;

function Probe() {
  query = useResolvedPaintingFiles(painting);
  return null;
}

describe('useResolvedPaintingFiles', () => {
  let queryClient: QueryClient;
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    query = undefined;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    jest.mocked(ExpoImage.loadAsync).mockResolvedValue({ height: 928, width: 1664 } as never);
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    queryClient.clear();
  });

  it('measures the primary output for the restored canvas frame', async () => {
    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <BackendProvider backend={backend}>
            <Probe />
          </BackendProvider>
        </QueryClientProvider>,
      );
    });

    await waitForCondition(() => query?.data !== undefined);

    expect(query?.data?.outputAspectRatio).toBeCloseTo(1664 / 928);
    expect(ExpoImage.loadAsync).toHaveBeenCalledWith('file:///generated.png');
  });
});

async function waitForCondition(predicate: () => boolean) {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) {
      return;
    }
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  }
  throw new Error('Timed out waiting for condition');
}
