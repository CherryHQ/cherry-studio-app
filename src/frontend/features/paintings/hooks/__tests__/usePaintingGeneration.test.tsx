import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data';
import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import type { Backend } from '@/shared/contracts';
import type { JobSnapshot } from '@/shared/data/api/schemas/jobs';
import type { ApiClient } from '@/shared/data/api/types';
import type { Painting } from '@/shared/data/types/painting';

import { usePaintingGeneration } from '../usePaintingGeneration';

const output = {
  fileEntryId: '00000000-0000-4000-8000-000000000009' as const,
  uri: 'file:///generated.png',
};
const painting: Painting = {
  createdAt: '2026-01-01T00:00:00.000Z',
  files: { input: [], output: [output.fileEntryId] },
  id: 'painting-1',
  modelId: 'provider::gpt-image-2',
  orderKey: 'painting-1',
  prompt: 'draw a cherry',
  providerId: 'provider',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function jobSnapshot(overrides: Partial<JobSnapshot>): JobSnapshot {
  return {
    attempt: 1,
    cancelRequested: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    error: null,
    finishedAt: null,
    id: 'job-1',
    idempotencyKey: null,
    input: null,
    maxAttempts: 1,
    metadata: {},
    output: null,
    parentId: null,
    priority: 0,
    queue: 'painting',
    scheduledAt: '2026-01-01T00:00:00.000Z',
    startedAt: '2026-01-01T00:00:00.000Z',
    status: 'running',
    timeoutMs: null,
    type: 'painting.generate',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const mockStartGeneration = jest.fn(async () => ({ jobId: 'job-1', paintingId: 'painting-1' }));
const mockCancelGeneration = jest.fn(async () => undefined);
const backend = {
  paintings: { cancelGeneration: mockCancelGeneration, startGeneration: mockStartGeneration },
} as unknown as Backend;
const mockSyncPaintingQueries = jest.fn(async () => undefined);
const mockDeletePaintings = jest.fn(async () => undefined);

/** Per-test ledger state served by the mocked Data API. */
let activeJobs: JobSnapshot[] = [];
let interruptedJobs: JobSnapshot[] = [];
let jobById = new Map<string, JobSnapshot>();

const dataApi = {
  delete: jest.fn(),
  get: jest.fn(async (path: string, options?: { query?: { status?: string } }) => {
    if (path === '/jobs') {
      return options?.query?.status?.includes('running') ? activeJobs : interruptedJobs;
    }
    const jobId = path.replace('/jobs/', '');
    const job = jobById.get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    return job;
  }),
  patch: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
} as unknown as jest.Mocked<ApiClient>;

jest.mock('@/frontend/features/paintings/hooks/usePaintings', () => ({
  useDeletePaintings: () => mockDeletePaintings,
  useSyncPaintingQueries: () => mockSyncPaintingQueries,
}));

type GenerationApi = ReturnType<typeof usePaintingGeneration>;
let api: GenerationApi | undefined;
let renderer: ReactTestRenderer | undefined;
let queryClient: QueryClient;

function Probe({
  initialAspectRatio,
  paintingId,
}: {
  initialAspectRatio?: number;
  paintingId?: string;
}) {
  const generation = usePaintingGeneration({ initialAspectRatio, initialOutputs: [], paintingId });
  useEffect(() => {
    api = generation;
  }, [generation]);
  return null;
}

async function mountProbe(paintingId?: string, initialAspectRatio?: number) {
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={queryClient}>
        <DataApiProvider dataApi={dataApi}>
          <BackendProvider backend={backend}>
            <Probe initialAspectRatio={initialAspectRatio} paintingId={paintingId} />
          </BackendProvider>
        </DataApiProvider>
      </QueryClientProvider>,
    );
  });
}

/** Flush act passes until the condition holds. Each pass yields a macrotask:
 * react-query batches observer notifications through `setTimeout(0)`, so
 * microtask-only passes would race the commit and flake. */
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

const request = {
  attachments: [
    {
      fileEntryId: '00000000-0000-4000-8000-000000000001' as const,
      id: 'draft-1',
      kind: 'image' as const,
      mediaType: 'image/png',
      name: 'input.png',
      status: 'ready' as const,
      uri: 'file:///input.png',
    },
  ],
  mode: 'generate' as const,
  modelId: 'provider::gpt-image-2' as const,
  modelName: 'GPT Image 2',
  paramValues: {},
  prompt: 'draw a cherry',
};

beforeEach(() => {
  jest.clearAllMocks();
  api = undefined;
  activeJobs = [];
  interruptedJobs = [];
  jobById = new Map();
  queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  queryClient.clear();
});

describe('usePaintingGeneration', () => {
  it('restores the initial output ratio until a new request replaces it', async () => {
    await mountProbe(undefined, 1664 / 928);

    expect(api?.aspectRatio).toBeCloseTo(1664 / 928);

    jobById.set(
      'job-1',
      jobSnapshot({ output: { outputs: [output], painting }, status: 'completed' }),
    );
    await act(async () => {
      await api?.generate({ ...request, paramValues: { size: '928x1664' } });
    });

    expect(api?.aspectRatio).toBeCloseTo(928 / 1664);
  });

  it('enqueues via the backend and displays outputs from the terminal job', async () => {
    jobById.set(
      'job-1',
      jobSnapshot({ output: { outputs: [output], painting }, status: 'completed' }),
    );
    await mountProbe();

    let result: Awaited<ReturnType<GenerationApi['generate']>> | undefined;
    await act(async () => {
      result = await api?.generate(request);
    });

    expect(mockStartGeneration).toHaveBeenCalledWith({
      images: [
        {
          fileEntryId: request.attachments[0].fileEntryId,
          id: 'draft-1',
          mediaType: 'image/png',
          name: 'input.png',
          uri: 'file:///input.png',
        },
      ],
      mode: 'generate',
      modelId: 'provider::gpt-image-2',
      modelName: 'GPT Image 2',
      paramValues: {},
      prompt: 'draw a cherry',
    });
    expect(result).toEqual({ outputs: [output], painting });
    expect(api?.outputs).toEqual([output]);
    expect(api?.paramValues).toEqual({});
    expect(api?.status).toBe('idle');
    expect(mockSyncPaintingQueries).toHaveBeenCalledWith(painting);
  });

  it('keeps the requested aspect ratio when the output arrives', async () => {
    jobById.set(
      'job-1',
      jobSnapshot({ output: { outputs: [output], painting }, status: 'completed' }),
    );
    await mountProbe();

    await act(async () => {
      await api?.generate({ ...request, paramValues: { aspectRatio: '3:4' } });
    });

    expect(api?.aspectRatio).toBeCloseTo(3 / 4);
    expect(api?.status).toBe('idle');
  });

  it('surfaces a failed job as frontend error state and allows a retry', async () => {
    mockStartGeneration.mockResolvedValueOnce({ jobId: 'job-fail', paintingId: 'painting-1' });
    jobById.set(
      'job-fail',
      jobSnapshot({
        error: { code: 'JOB_HANDLER_THREW', message: 'network failed', retryable: true },
        id: 'job-fail',
        status: 'failed',
      }),
    );
    await mountProbe();

    let settled: unknown;
    await act(async () => {
      settled = await api?.generate(request).catch((error: unknown) => error);
    });
    expect(settled).toEqual(new Error('network failed'));
    expect(api?.error).toEqual(new Error('network failed'));
    expect(api?.status).toBe('idle');

    mockStartGeneration.mockResolvedValueOnce({ jobId: 'job-2', paintingId: 'painting-1' });
    jobById.set(
      'job-2',
      jobSnapshot({ id: 'job-2', output: { outputs: [output], painting }, status: 'completed' }),
    );
    // Two act passes: the first lets `startGeneration` resolve and exits so act
    // flushes the enqueue render (the poll query only subscribes then); awaiting
    // the result inside that same act would deadlock on its own flush.
    let retry: Promise<unknown> | undefined;
    await act(async () => {
      retry = api?.generate(request);
      await Promise.resolve();
    });
    await act(async () => {
      await retry;
    });
    expect(api?.status).toBe('idle');
    expect(mockStartGeneration).toHaveBeenCalledTimes(2);
  });

  it('rejects the enqueue failure without touching the ledger', async () => {
    mockStartGeneration.mockRejectedValueOnce(new Error('validation failed'));
    await mountProbe();

    let settled: unknown;
    await act(async () => {
      settled = await api?.generate(request).catch((error: unknown) => error);
    });
    expect(settled).toEqual(new Error('validation failed'));
    expect(api?.error).toEqual(new Error('validation failed'));
    expect(api?.status).toBe('idle');
  });

  it('cancels an active job as a non-error outcome and deletes its receipt', async () => {
    jobById.set('job-1', jobSnapshot({ status: 'running' }));
    await mountProbe();

    let settled: Promise<unknown> | undefined;
    await act(async () => {
      settled = api?.generate(request).catch((error) => error);
      await Promise.resolve();
    });
    expect(api?.status).toBe('generating');

    let result: unknown;
    await act(async () => {
      api?.cancel();
      result = await settled;
    });

    expect(mockCancelGeneration).toHaveBeenCalledWith('job-1');
    expect(mockDeletePaintings).toHaveBeenCalledWith(['painting-1']);
    expect(result).toBeNull();
    expect(api?.error).toBeNull();
    expect(api?.status).toBe('idle');
  });

  it('honors cancellation while the enqueue request is still pending', async () => {
    let resolveStart: ((value: { jobId: string; paintingId: string }) => void) | undefined;
    mockStartGeneration.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    );
    await mountProbe();

    let settled: Promise<unknown> | undefined;
    let result: unknown;
    await act(async () => {
      settled = api?.generate(request);
      await Promise.resolve();
      api?.cancel();
      resolveStart?.({ jobId: 'job-enqueue', paintingId: 'painting-enqueue' });
      result = await settled;
    });

    expect(mockCancelGeneration).toHaveBeenCalledWith('job-enqueue');
    expect(mockDeletePaintings).toHaveBeenCalledWith(['painting-enqueue']);
    expect(result).toBeNull();
    expect(api?.status).toBe('idle');
  });

  it('keeps polling when the cancellation request fails', async () => {
    mockCancelGeneration.mockRejectedValueOnce(new Error('cancel unavailable'));
    jobById.set('job-1', jobSnapshot({ status: 'running' }));
    await mountProbe();

    let settled: Promise<unknown> | undefined;
    await act(async () => {
      settled = api?.generate(request);
      await Promise.resolve();
    });
    await act(async () => {
      api?.cancel();
    });
    await waitForCondition(() => api?.error?.message === 'cancel unavailable');

    expect(api?.error).toEqual(new Error('cancel unavailable'));
    expect(api?.status).toBe('generating');
    expect(mockDeletePaintings).not.toHaveBeenCalled();

    jobById.set(
      'job-1',
      jobSnapshot({ output: { outputs: [output], painting }, status: 'completed' }),
    );
    await act(async () => {
      await queryClient.refetchQueries();
      await settled;
    });

    expect(api?.outputs).toEqual([output]);
    expect(api?.status).toBe('idle');
  });

  it("adopts this painting's still-active generation on mount and displays its result", async () => {
    activeJobs = [
      jobSnapshot({
        input: {
          paintingId: 'painting-1',
          paramValues: { aspectRatio: '3:4', resolution: '2K' },
          prompt: 'adopt this request',
        },
        status: 'running',
      }),
    ];
    jobById.set('job-1', jobSnapshot({ status: 'running' }));
    await mountProbe('painting-1');
    await waitForCondition(() => api?.status === 'generating');

    expect(api?.aspectRatio).toBeCloseTo(3 / 4);
    expect(api?.paramValues).toEqual({ aspectRatio: '3:4', resolution: '2K' });

    jobById.set(
      'job-1',
      jobSnapshot({ output: { outputs: [output], painting }, status: 'completed' }),
    );
    await act(async () => {
      await queryClient.refetchQueries();
    });
    await waitForCondition(() => api?.status === 'idle');

    expect(api?.outputs).toEqual([output]);
    expect(api?.aspectRatio).toBeCloseTo(3 / 4);
    expect(mockSyncPaintingQueries).toHaveBeenCalledWith(painting);
  });

  it('leaves a blank composer blank while another painting is generating', async () => {
    activeJobs = [jobSnapshot({ input: { paintingId: 'painting-other' }, status: 'running' })];
    jobById.set('job-1', jobSnapshot({ status: 'running' }));
    await mountProbe();
    await waitForCondition(() => dataApi.get.mock.calls.length > 0);

    expect(api?.status).toBe('idle');
    expect(api?.interruption).toBeNull();
  });

  it("ignores another painting's generation even when bound to a receipt", async () => {
    activeJobs = [jobSnapshot({ input: { paintingId: 'painting-other' }, status: 'running' })];
    await mountProbe('painting-1');
    await waitForCondition(() => api?.interruption !== null);

    expect(api?.status).toBe('idle');
  });

  it('reports an image-less receipt with nothing running as interrupted, carrying the provider text', async () => {
    interruptedJobs = [
      jobSnapshot({
        error: { code: 'JOB_HANDLER_THREW', message: 'Invalid JSON response', retryable: true },
        input: { paintingId: 'painting-1' },
        status: 'failed',
      }),
    ];
    await mountProbe('painting-1');
    await waitForCondition(() => api?.interruption !== null);

    expect(api?.interruption).toEqual({ message: 'Invalid JSON response' });
  });

  it('keeps a cancelled job wordless: its message never went through i18n', async () => {
    interruptedJobs = [
      jobSnapshot({
        error: {
          code: 'JOB_CANCELLED',
          message: 'Cancelled by startup recovery',
          retryable: false,
        },
        input: { paintingId: 'painting-1' },
        status: 'cancelled',
      }),
    ];
    await mountProbe('painting-1');
    await waitForCondition(() => api?.interruption !== null);

    expect(api?.interruption).toEqual({ message: undefined });
  });

  it('retries into the interrupted receipt instead of minting a second painting', async () => {
    interruptedJobs = [
      jobSnapshot({
        error: { code: 'JOB_HANDLER_THREW', message: 'boom', retryable: true },
        input: { paintingId: 'painting-1' },
        status: 'failed',
      }),
    ];
    jobById.set(
      'job-1',
      jobSnapshot({ output: { outputs: [output], painting }, status: 'completed' }),
    );
    await mountProbe('painting-1');
    await waitForCondition(() => api?.interruption !== null);

    await act(async () => {
      await api?.generate(request);
    });

    expect(mockStartGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ paintingId: 'painting-1' }),
    );
  });

  it('starts a fresh painting from a blank composer', async () => {
    jobById.set(
      'job-1',
      jobSnapshot({ output: { outputs: [output], painting }, status: 'completed' }),
    );
    await mountProbe();

    await act(async () => {
      await api?.generate(request);
    });

    expect(mockStartGeneration).toHaveBeenCalledWith(
      expect.not.objectContaining({ paintingId: expect.anything() }),
    );
  });
});
