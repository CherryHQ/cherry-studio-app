import type { Painting } from '@cherrystudio/universal/data/types/painting';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data';
import type { Backend, PaintingGenerationSession } from '@/shared/contracts';

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
const mockGenerate = jest.fn<
  ReturnType<PaintingGenerationSession['generate']>,
  Parameters<PaintingGenerationSession['generate']>
>();
const mockDispose = jest.fn();
const session: PaintingGenerationSession = {
  dispose: mockDispose,
  generate: mockGenerate,
};
const mockCreateGenerationSession = jest.fn(() => session);
const backend = {
  paintings: { createGenerationSession: mockCreateGenerationSession },
} as unknown as Backend;
const mockSyncPaintingQueries = jest.fn(async () => undefined);

jest.mock('@/frontend/features/paintings/hooks/usePaintings', () => ({
  useSyncPaintingQueries: () => mockSyncPaintingQueries,
}));

type GenerationApi = ReturnType<typeof usePaintingGeneration>;
let api: GenerationApi | undefined;
let renderer: ReactTestRenderer | undefined;

function Probe() {
  const generation = usePaintingGeneration({ initialOutputs: [] });
  useEffect(() => {
    api = generation;
  }, [generation]);
  return null;
}

const request = {
  attachments: [
    {
      fileEntryId: '00000000-0000-4000-8000-000000000001' as const,
      id: 'draft-1',
      kind: 'image' as const,
      mediaType: 'image/png',
      name: 'input.png',
      uri: 'file:///input.png',
    },
  ],
  mode: 'generate' as const,
  modelId: 'provider::gpt-image-2' as const,
  paramValues: {},
  prompt: 'draw a cherry',
};

beforeEach(async () => {
  jest.clearAllMocks();
  api = undefined;
  mockGenerate.mockResolvedValue({ outputs: [output], painting });
  await act(async () => {
    renderer = create(
      <BackendProvider backend={backend}>
        <Probe />
      </BackendProvider>,
    );
  });
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
});

describe('usePaintingGeneration', () => {
  it('maps image drafts into a backend session and reveals persisted outputs', async () => {
    let result: Awaited<ReturnType<GenerationApi['generate']>> | undefined;
    await act(async () => {
      result = await api?.generate(request);
    });

    expect(mockGenerate).toHaveBeenCalledWith(
      {
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
        paramValues: {},
        prompt: 'draw a cherry',
      },
      expect.any(AbortSignal),
    );
    expect(result).toEqual({ outputs: [output], painting });
    expect(api?.outputs).toEqual([output]);
    expect(api?.status).toBe('revealing');
    expect(mockSyncPaintingQueries).toHaveBeenCalledWith(painting);
  });

  it('keeps workflow failure as frontend error state and reuses the same session', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('network failed'));

    await act(async () => {
      await expect(api?.generate(request)).rejects.toThrow('network failed');
    });
    expect(api?.error).toEqual(new Error('network failed'));
    expect(api?.status).toBe('idle');

    await act(async () => {
      await api?.generate(request);
    });
    expect(mockCreateGenerationSession).toHaveBeenCalledTimes(1);
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });

  it('aborts the active backend call and disposes its session on unmount', async () => {
    let observedSignal: AbortSignal | undefined;
    mockGenerate.mockImplementationOnce((_input, signal) => {
      observedSignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });

    const result = api?.generate(request).catch((error) => error);
    await act(async () => {
      api?.cancel();
      await result;
    });

    expect(observedSignal?.aborted).toBe(true);
    expect(api?.error).toEqual(new Error('Painting generation cancelled'));

    await act(async () => renderer?.unmount());
    renderer = undefined;
    expect(mockDispose).toHaveBeenCalledTimes(1);
  });
});
