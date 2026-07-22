import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Painting } from '@/data/types/painting';
import type { ResolvedPaintingFiles } from '@/hooks/paintings';

import { PaintingViewerScreen } from '../PaintingViewerScreen';

const mockRouterBack = jest.fn();
const mockPaintingIds: (string | undefined)[] = [];
const mockResolvedPaintingIds: (string | undefined)[] = [];
const mockPaintingById = new Map<string, Painting>();
const mockFilesByPaintingId = new Map<string, ResolvedPaintingFiles>();
let mockSearchParams = { fileEntryId: 'file-1', paintingId: 'painting-1' };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => ({ back: mockRouterBack }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('@/config/constants', () => ({
  isIOS: true,
  paintingViewer: { aspectRatios: [] },
}));

jest.mock('@/hooks/paintings', () => ({
  usePainting: (paintingId: string | undefined) => {
    mockPaintingIds.push(paintingId);
    return { data: paintingId ? mockPaintingById.get(paintingId) : undefined, isLoading: false };
  },
  useResolvedPaintingFiles: (painting: Painting | undefined) => {
    mockResolvedPaintingIds.push(painting?.id);
    return {
      data: painting ? mockFilesByPaintingId.get(painting.id) : undefined,
      isLoading: false,
    };
  },
}));

jest.mock('../components/PaintingViewerChrome', () => {
  const React = jest.requireActual('react');
  return {
    PaintingViewerChrome: (props: Record<string, unknown>) =>
      React.createElement('MockPaintingViewerChrome', props),
  };
});

jest.mock('../components/ViewerImage', () => {
  const React = jest.requireActual('react');
  return {
    ViewerImage: (props: Record<string, unknown>) => React.createElement('MockViewerImage', props),
  };
});

jest.mock('../hooks/usePaintingViewerActions', () => ({
  usePaintingViewerActions: () => ({
    download: jest.fn(),
    edit: jest.fn(),
    remove: jest.fn(),
    resize: jest.fn(),
    viewConversation: jest.fn(),
  }),
}));

describe('PaintingViewerScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPaintingIds.length = 0;
    mockResolvedPaintingIds.length = 0;
    mockPaintingById.clear();
    mockFilesByPaintingId.clear();
    mockSearchParams = { fileEntryId: 'file-1', paintingId: 'painting-1' };
    addPainting('painting-1', 'file-1');
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('loads the painting detail and renders the requested output', async () => {
    await renderViewer();

    expect(mockPaintingIds).toEqual(['painting-1']);
    expect(mockResolvedPaintingIds).toEqual(['painting-1']);
    expect(renderer?.root.findByType('MockViewerImage').props).toMatchObject({
      uri: 'file:///file-1.png',
    });
  });

  it('switches detail queries when the route params change without remounting', async () => {
    addPainting('painting-2', 'file-2');
    await renderViewer();

    mockSearchParams = { fileEntryId: 'file-2', paintingId: 'painting-2' };
    await act(async () => renderer?.update(<PaintingViewerScreen />));

    expect(mockPaintingIds).toEqual(['painting-1', 'painting-2']);
    expect(renderer?.root.findByType('MockViewerImage').props).toMatchObject({
      uri: 'file:///file-2.png',
    });
  });

  it('does not render a viewer when the requested output is missing', async () => {
    mockSearchParams = { fileEntryId: 'missing-file', paintingId: 'painting-1' };
    await renderViewer();

    expect(renderer?.root.findAllByType('MockViewerImage')).toHaveLength(0);
    expect(renderer?.root.findAllByType('MockPaintingViewerChrome')).toHaveLength(0);
  });

  it('opens an older painting directly without requiring it in a gallery page', async () => {
    addPainting('older-painting', 'older-file');
    mockSearchParams = { fileEntryId: 'older-file', paintingId: 'older-painting' };
    await renderViewer();

    expect(mockPaintingIds).toEqual(['older-painting']);
    expect(renderer?.root.findByType('MockViewerImage').props.uri).toBe('file:///older-file.png');
  });

  async function renderViewer() {
    await act(async () => {
      renderer = create(<PaintingViewerScreen />);
    });
  }
});

function addPainting(paintingId: string, fileEntryId: string) {
  mockPaintingById.set(paintingId, {
    createdAt: '2026-07-21T00:00:00.000Z',
    files: { input: [], output: [fileEntryId] },
    id: paintingId,
    modelId: 'provider::model',
    orderKey: paintingId,
    prompt: paintingId,
    providerId: 'provider',
    updatedAt: '2026-07-21T00:00:00.000Z',
  });
  mockFilesByPaintingId.set(paintingId, {
    inputs: [],
    outputs: [
      {
        fileEntryId,
        id: `painting-file:${fileEntryId}`,
        kind: 'image',
        mediaType: 'image/png',
        name: `${fileEntryId}.png`,
        uri: `file:///${fileEntryId}.png`,
      },
    ],
  });
}
