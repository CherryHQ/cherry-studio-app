import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { usePaintingGeneration } from '../usePaintingGeneration';

const mockGenerateImage = jest.fn();
const mockCreatePainting = jest.fn();
const mockReplaceOutputs = jest.fn();
const mockInvalidate = jest.fn(async () => undefined);

jest.mock('@/data/runtime', () => ({
  useDataServices: () => ({
    ai: { generateImage: mockGenerateImage },
    painting: {
      create: mockCreatePainting,
      replaceOutputs: mockReplaceOutputs,
    },
  }),
}));

jest.mock('@/hooks/paintings', () => ({
  usePaintingQueryInvalidation: () => mockInvalidate,
}));

jest.mock('@/data/services/fileStorage', () => ({
  discardPreparedFiles: jest.fn(),
  imageUriToDataUrl: jest.fn(),
  prepareGeneratedImage: jest.fn(() => ({
    ext: 'png',
    id: '00000000-0000-7000-8000-000000000009',
    name: 'generated',
    size: 4,
    uri: 'file:///generated.png',
  })),
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
  mockReplaceOutputs.mockImplementation(async (id: string) => ({
    files: { input: [], output: [`output-${id}`] },
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
  modelId: 'provider::gpt-image-2' as const,
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

  it('returns the persisted painting and generated output', async () => {
    mockGenerateImage.mockResolvedValue({
      images: [{ base64: 'AAAA', mediaType: 'image/png' }],
    });

    let result: Awaited<ReturnType<GenerationApi['generate']>> | undefined;
    await act(async () => {
      result = await api?.generate(request);
    });

    expect(result).toEqual({
      output: {
        fileEntryId: 'output-receipt-1',
        uri: 'file:///generated.png',
      },
      painting: {
        files: { input: [], output: ['output-receipt-1'] },
        id: 'receipt-1',
      },
    });
    expect(mockInvalidate).toHaveBeenCalledWith('receipt-1');
  });
});
