import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import type { JobSnapshot } from '@/shared/data/api/schemas/jobs';
import type { ApiClient } from '@/shared/data/api/types';

import { paintingJobFailureMessage, usePaintingJobs } from '../usePaintingJobs';

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
    startedAt: null,
    status: 'running',
    timeoutMs: null,
    type: 'painting.generate',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

let activeJobs: JobSnapshot[] = [];
let interruptedJobs: JobSnapshot[] = [];

const dataApi = {
  delete: jest.fn(),
  get: jest.fn(async (path: string, options?: { query?: { status?: string } }) =>
    path === '/jobs' && !options?.query?.status?.includes('running') ? interruptedJobs : activeJobs,
  ),
  patch: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
} as unknown as jest.Mocked<ApiClient>;

let api: ReturnType<typeof usePaintingJobs> | undefined;
let renderer: ReactTestRenderer | undefined;
let queryClient: QueryClient;

function Probe() {
  const jobs = usePaintingJobs();
  useEffect(() => {
    api = jobs;
  }, [jobs]);
  return null;
}

async function mountProbe() {
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={queryClient}>
        <DataApiProvider dataApi={dataApi}>
          <Probe />
        </DataApiProvider>
      </QueryClientProvider>,
    );
  });
}

async function settle() {
  for (let index = 0; index < 10; index += 1) {
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  api = undefined;
  activeJobs = [];
  interruptedJobs = [];
  queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  queryClient.clear();
});

describe('usePaintingJobs', () => {
  it('indexes jobs by the painting they write into', async () => {
    activeJobs = [jobSnapshot({ id: 'job-a', input: { paintingId: 'painting-1' } })];
    interruptedJobs = [
      jobSnapshot({ id: 'job-b', input: { paintingId: 'painting-2' }, status: 'failed' }),
    ];
    await mountProbe();
    await settle();

    expect(api?.activeByPaintingId.get('painting-1')?.id).toBe('job-a');
    expect(api?.interruptedByPaintingId.get('painting-2')?.id).toBe('job-b');
    expect(api?.activeByPaintingId.get('painting-2')).toBeUndefined();
  });

  it('keeps the newest job per painting and skips rows with no receipt', async () => {
    // The list arrives newest first, so the first hit per painting wins.
    activeJobs = [
      jobSnapshot({ id: 'job-new', input: { paintingId: 'painting-1' } }),
      jobSnapshot({ id: 'job-old', input: { paintingId: 'painting-1' } }),
      jobSnapshot({ id: 'job-orphan', input: null }),
    ];
    await mountProbe();
    await settle();

    expect(api?.activeByPaintingId.size).toBe(1);
    expect(api?.activeByPaintingId.get('painting-1')?.id).toBe('job-new');
  });

  it('refreshes the gallery when a generation enters the active set', async () => {
    await mountProbe();
    await settle();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    // Enqueueing writes the receipt straight into the database, but the list
    // the gallery renders from is a cached page that nothing else refetches.
    activeJobs = [jobSnapshot({ id: 'job-a', input: { paintingId: 'painting-1' } })];
    await act(async () => {
      await queryClient.refetchQueries();
    });
    await settle();

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['/paintings'] });
  });

  it('refreshes the gallery when a generation leaves the active set', async () => {
    activeJobs = [jobSnapshot({ id: 'job-a', input: { paintingId: 'painting-1' } })];
    await mountProbe();
    await settle();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    activeJobs = [];
    await act(async () => {
      await queryClient.refetchQueries();
    });
    await settle();

    // Nothing else invalidates `/paintings` while the user sits on the list.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['/paintings'] });
  });

  it('does not refresh the gallery while the same generation keeps running', async () => {
    activeJobs = [jobSnapshot({ id: 'job-a', input: { paintingId: 'painting-1' } })];
    await mountProbe();
    await settle();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await queryClient.refetchQueries();
    });
    await settle();

    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('paintingJobFailureMessage', () => {
  it('repeats provider text but never the internal cancellation wording', () => {
    expect(
      paintingJobFailureMessage(
        jobSnapshot({
          error: { code: 'JOB_HANDLER_THREW', message: 'Invalid JSON response', retryable: true },
          status: 'failed',
        }),
      ),
    ).toBe('Invalid JSON response');
    expect(
      paintingJobFailureMessage(
        jobSnapshot({
          error: {
            code: 'JOB_CANCELLED',
            message: 'Cancelled by startup recovery',
            retryable: false,
          },
          status: 'cancelled',
        }),
      ),
    ).toBeUndefined();
    expect(paintingJobFailureMessage(undefined)).toBeUndefined();
  });
});
