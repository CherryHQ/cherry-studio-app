import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { useEffect, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data';
import type { Backend } from '@/shared/contracts';
import type { Painting } from '@/shared/data/types/painting';

import { usePaintingGalleryEntries, useResolvedPaintingFiles } from '../usePaintings';

jest.mock('expo-image', () => ({
  Image: { loadAsync: jest.fn() },
}));

const activeJob = {
  id: 'job-1',
  input: { paintingId: 'painting-1', paramValues: { size: '1664x928' } },
  status: 'running',
};

jest.mock('../usePaintingJobs', () => ({
  ...jest.requireActual('../usePaintingJobs'),
  usePaintingJobs: () => ({
    activeByPaintingId: new Map([['painting-1', activeJob]]),
    interruptedByPaintingId: new Map(),
    isLoading: false,
  }),
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

const olderPainting: Painting = {
  ...painting,
  createdAt: '2026-08-10T00:00:00.000Z',
  files: { input: [], output: ['output-2'] },
  id: 'painting-2',
  orderKey: 'painting-2',
  prompt: 'draw an older miniature city',
  updatedAt: '2026-08-10T00:01:00.000Z',
};

const resolveFiles = jest.fn(async (_painting: Painting) => ({
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
  const files = useResolvedPaintingFiles(painting);
  useEffect(() => {
    query = files;
  }, [files]);
  return null;
}

let entries: ReturnType<typeof usePaintingGalleryEntries> | undefined;
let appendOlderPainting: (() => void) | undefined;

function GalleryProbe() {
  const [paintings, setPaintings] = useState([painting]);
  const gallery = usePaintingGalleryEntries(paintings);
  useEffect(() => {
    entries = gallery;
  }, [gallery]);
  useEffect(() => {
    appendOlderPainting = () => setPaintings((current) => [...current, olderPainting]);
    return () => {
      appendOlderPainting = undefined;
    };
  }, []);
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

    await waitForCondition(() => query?.isLoading === false);

    expect(query?.data?.outputAspectRatio).toBeCloseTo(1664 / 928);
    expect(ExpoImage.loadAsync).toHaveBeenCalledWith('file:///generated.png');
  });
});

describe('usePaintingGalleryEntries', () => {
  let queryClient: QueryClient;
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    appendOlderPainting = undefined;
    entries = undefined;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    queryClient.clear();
  });

  it('shapes an output-less receipt from the params its job asked for', async () => {
    resolveFiles.mockResolvedValue({ inputs: [], outputs: [] } as never);

    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <BackendProvider backend={backend}>
            <GalleryProbe />
          </BackendProvider>
        </QueryClientProvider>,
      );
    });

    await waitForCondition(() => entries?.isLoading === false);

    // Nothing has been generated yet, so the request is all the tile has to go
    // on for both the shape it reserves and the size it names.
    expect(entries?.items).toEqual([
      expect.objectContaining({
        aspectRatio: 1664 / 928,
        kind: 'generating',
        resolution: '1664 × 928',
      }),
    ]);
  });

  it('resolves and measures only paintings added by the next page', async () => {
    resolveFiles.mockImplementation(async (currentPainting) => ({
      inputs: [],
      outputs: [
        {
          entry: {
            ext: 'png',
            id: currentPainting.files.output[0] ?? 'missing-output',
            name: 'generated',
            origin: 'internal',
            size: 1024,
          },
          uri: `file:///${currentPainting.id}.png`,
        },
      ],
    }));
    jest.mocked(ExpoImage.loadAsync).mockResolvedValue({ height: 928, width: 1664 } as never);

    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <BackendProvider backend={backend}>
            <GalleryProbe />
          </BackendProvider>
        </QueryClientProvider>,
      );
    });
    await waitForCondition(() => entries?.items.length === 1);

    expect(resolveFiles).toHaveBeenCalledTimes(1);
    expect(ExpoImage.loadAsync).toHaveBeenCalledTimes(1);

    await act(async () => appendOlderPainting?.());
    await waitForCondition(() => entries?.items.length === 2);

    expect(resolveFiles).toHaveBeenCalledTimes(2);
    expect(resolveFiles.mock.calls.map(([currentPainting]) => currentPainting.id)).toEqual([
      'painting-1',
      'painting-2',
    ]);
    expect(ExpoImage.loadAsync).toHaveBeenCalledTimes(2);
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
