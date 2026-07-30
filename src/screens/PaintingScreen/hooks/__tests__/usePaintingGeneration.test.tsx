import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { usePaintingGeneration } from '../usePaintingGeneration';

const mockGenerateImage = jest.fn();
const mockCreatePainting = jest.fn();
const mockReplaceOutputs = jest.fn();
const mockSyncPaintingQueries = jest.fn(async () => undefined);

jest.mock('@/runtime', () => ({
  useDataServices: () => ({
    ai: { generateImage: mockGenerateImage },
    painting: {
      create: mockCreatePainting,
      replaceOutputs: mockReplaceOutputs,
    },
  }),
}));

jest.mock('@/hooks/paintings', () => ({
  useSyncPaintingQueries: () => mockSyncPaintingQueries,
}));

jest.mock('@/data/services/fileStorage', () => ({
  discardPreparedFiles: jest.fn(),
  imageUriToDataUrl: jest.fn(),
  prepareGeneratedImage: jest.fn((base64: string) => {
    const suffix = base64 === 'BBBB' ? '10' : '09';
    return {
      ext: 'png',
      id: `00000000-0000-7000-8000-0000000000${suffix}`,
      name: 'generated',
      size: 4,
      uri: `file:///generated-${suffix}.png`,
    };
  }),
  prepareInternalFileFromUri: jest.fn(),
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

beforeEach(async () => {
  jest.clearAllMocks();
  api = undefined;
  let receiptIndex = 0;
  mockCreatePainting.mockImplementation(async () => {
    receiptIndex += 1;
    return { id: `receipt-${receiptIndex}` };
  });
  mockReplaceOutputs.mockImplementation(async (id: string, outputs: Array<{ id: string }>) => ({
    files: { input: [], output: outputs.map((output) => output.id) },
    id,
  }));
  await act(async () => {
    renderer = create(<Probe />);
  });
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
});

const request = {
  attachments: [],
  mode: 'generate' as const,
  modelId: 'provider::gpt-image-2' as const,
  paramValues: {},
  prompt: 'draw a cherry',
};

describe('usePaintingGeneration', () => {
  it('retries the same incomplete receipt after a generation failure', async () => {
    mockGenerateImage
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce({ images: [{ base64: 'AAAA', mediaType: 'image/png' }] });

    let failure: unknown;
    await act(async () => {
      try {
        await api?.generate(request);
      } catch (error) {
        failure = error;
      }
    });
    expect(failure).toEqual(new Error('network failed'));
    await act(async () => {
      await api?.generate(request);
    });

    expect(mockCreatePainting).toHaveBeenCalledTimes(1);
    expect(mockReplaceOutputs).toHaveBeenCalledWith('receipt-1', [expect.any(Object)]);
  });

  it('creates a new receipt when generating again after a completed output', async () => {
    mockGenerateImage.mockResolvedValue({
      images: [{ base64: 'AAAA', mediaType: 'image/png' }],
    });

    await act(async () => api?.generate(request));
    await act(async () => api?.finishReveal());
    await act(async () => api?.generate(request));

    expect(mockCreatePainting).toHaveBeenCalledTimes(2);
    expect(mockReplaceOutputs).toHaveBeenNthCalledWith(1, 'receipt-1', [expect.any(Object)]);
    expect(mockReplaceOutputs).toHaveBeenNthCalledWith(2, 'receipt-2', [expect.any(Object)]);
  });

  it('creates a new receipt when normalized parameters change after a failure', async () => {
    mockGenerateImage
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce({ images: [{ base64: 'AAAA', mediaType: 'image/png' }] });

    await act(async () => {
      await expect(api?.generate({ ...request, paramValues: { quality: 'low' } })).rejects.toThrow(
        'network failed',
      );
    });
    await act(async () => {
      await api?.generate({ ...request, paramValues: { quality: 'high' } });
    });

    expect(mockCreatePainting).toHaveBeenCalledTimes(2);
    expect(mockReplaceOutputs).toHaveBeenCalledWith('receipt-2', [expect.any(Object)]);
  });

  it('persists and returns every generated image in provider order', async () => {
    mockGenerateImage.mockResolvedValue({
      images: [
        { base64: 'AAAA', mediaType: 'image/png' },
        { base64: 'BBBB', mediaType: 'image/webp' },
      ],
    });

    let result: Awaited<ReturnType<GenerationApi['generate']>> | undefined;
    await act(async () => {
      result = await api?.generate(request);
    });

    expect(mockReplaceOutputs).toHaveBeenCalledWith('receipt-1', [
      expect.objectContaining({ id: '00000000-0000-7000-8000-000000000009' }),
      expect.objectContaining({ id: '00000000-0000-7000-8000-000000000010' }),
    ]);
    expect(result?.outputs).toEqual([
      {
        fileEntryId: '00000000-0000-7000-8000-000000000009',
        uri: 'file:///generated-09.png',
      },
      {
        fileEntryId: '00000000-0000-7000-8000-000000000010',
        uri: 'file:///generated-10.png',
      },
    ]);
  });

  it('returns the persisted painting and generated output', async () => {
    mockGenerateImage.mockResolvedValue({
      images: [{ base64: 'AAAA', mediaType: 'image/png' }],
    });

    let result: Awaited<ReturnType<GenerationApi['generate']>> | undefined;
    await act(async () => {
      result = await api?.generate(request);
    });

    expect(result).toEqual({
      outputs: [
        {
          fileEntryId: '00000000-0000-7000-8000-000000000009',
          uri: 'file:///generated-09.png',
        },
      ],
      painting: {
        files: { input: [], output: ['00000000-0000-7000-8000-000000000009'] },
        id: 'receipt-1',
      },
    });
    expect(mockSyncPaintingQueries).toHaveBeenCalledWith({
      files: { input: [], output: ['00000000-0000-7000-8000-000000000009'] },
      id: 'receipt-1',
    });
  });
});
