import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { PaintingInputSubmission } from '@/frontend/components/PaintingInput';
import { BackendProvider } from '@/frontend/data';
import type { Backend, PaintingGenerationInput, PaintingGenerationStart } from '@/shared/contracts';

import { usePaintingBoardGeneration } from '../usePaintingBoardGeneration';

const mockDeletePaintings = jest.fn<Promise<void>, [readonly string[]]>();
const mockStartGeneration = jest.fn<Promise<PaintingGenerationStart>, [PaintingGenerationInput]>();

jest.mock('@/frontend/data/paintings/usePaintings', () => ({
  useDeletePaintings: () => mockDeletePaintings,
  useStartPaintingGeneration: () => mockStartGeneration,
}));
jest.mock('@/frontend/data/paintings/usePaintingJobs', () => ({
  usePaintingJobs: () => ({ activeByPaintingId: new Map() }),
}));

const backend = { paintings: { startGeneration: mockStartGeneration } } as unknown as Backend;
const input: PaintingInputSubmission = {
  attachments: [],
  mode: 'generate',
  modelId: 'provider::image',
  modelName: 'Image',
  paramValues: {},
  prompt: 'A miniature city',
};

let generation: ReturnType<typeof usePaintingBoardGeneration>;
let renderer: ReactTestRenderer | undefined;
let queryClient: QueryClient;

function Probe({ initialBoardId }: { initialBoardId?: string }) {
  const current = usePaintingBoardGeneration(initialBoardId);
  useLayoutEffect(() => {
    generation = current;
  });
  return null;
}

async function mount(initialBoardId?: string) {
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={queryClient}>
        <BackendProvider backend={backend}>
          <Probe initialBoardId={initialBoardId} />
        </BackendProvider>
      </QueryClientProvider>,
    );
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockDeletePaintings.mockResolvedValue(undefined);
  mockStartGeneration.mockResolvedValue({
    boardId: 'board-1',
    jobId: 'job-1',
    paintingId: 'painting-1',
  });
  queryClient = new QueryClient();
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  queryClient.clear();
});

it('creates a fresh board when sending again after stopping the first generation', async () => {
  await mount();
  await act(async () => {
    await generation.generate(input);
  });
  expect(generation.boardId).toBe('board-1');

  await act(async () => {
    await generation.cancel('painting-1', true);
  });
  expect(generation.boardId).toBeUndefined();

  mockStartGeneration.mockResolvedValue({
    boardId: 'board-2',
    jobId: 'job-2',
    paintingId: 'painting-2',
  });
  await act(async () => {
    await generation.generate({ ...input, prompt: 'A different city' });
  });

  expect(mockStartGeneration.mock.calls[1]?.[0]).not.toHaveProperty('boardId');
  expect(generation.boardId).toBe('board-2');
});

it('keeps the board for the next send when stopping one of several generations', async () => {
  await mount('board-1');
  await act(async () => {
    await generation.cancel('painting-2', false);
  });
  await act(async () => {
    await generation.generate(input);
  });

  expect(mockStartGeneration.mock.calls[0]?.[0].boardId).toBe('board-1');
});

it('keeps the board when stopping fails to delete its last receipt', async () => {
  await mount('board-1');
  mockDeletePaintings.mockRejectedValueOnce(new Error('Could not delete'));
  await act(async () => {
    await expect(generation.cancel('painting-1', true)).rejects.toThrow('Could not delete');
  });

  expect(generation.boardId).toBe('board-1');
});
