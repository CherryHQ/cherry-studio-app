import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { PaintingGalleryItem } from '@/hooks/paintings';

import { PaintingViewerScreen } from '../PaintingViewerScreen';

const mockRouterBack = jest.fn();
const mockLoadMore = jest.fn();
let mockCurrentPaintingId: string | undefined;
let mockSearchParams = { fileEntryId: 'file-1', paintingId: 'painting-1' };
let mockViewerImageProps: { sourceKey: string; uri: string } | undefined;

const mockItems: PaintingGalleryItem[] = [
  createGalleryItem('painting-1', 'file-1'),
  createGalleryItem('painting-2', 'file-2'),
  createGalleryItem('painting-3', 'file-3'),
];

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => ({ back: mockRouterBack, setParams: jest.fn() }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('@/config/constants', () => ({
  isIOS: true,
  paintingViewer: { aspectRatios: [] },
}));

jest.mock('@/hooks/paintings', () => ({
  usePaintingGalleryItems: () => ({ data: mockItems, isLoading: false }),
  usePaintings: () => ({ isLoading: false, loadMore: mockLoadMore, paintings: [] }),
}));

jest.mock('../components/PaintingViewerChrome', () => ({ PaintingViewerChrome: () => null }));

jest.mock('../components/ViewerImage', () => ({
  ViewerImage: (props: { sourceKey: string; uri: string }) => {
    mockViewerImageProps = props;
    return null;
  },
}));

jest.mock('../hooks/usePaintingViewerActions', () => ({
  usePaintingViewerActions: ({ painting }: { painting: { id: string } }) => {
    mockCurrentPaintingId = painting.id;
    return {
      download: jest.fn(),
      edit: jest.fn(),
      remove: jest.fn(),
      resize: jest.fn(),
      viewConversation: jest.fn(),
    };
  },
}));

describe('PaintingViewerScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCurrentPaintingId = undefined;
    mockSearchParams = { fileEntryId: 'file-1', paintingId: 'painting-1' };
    mockViewerImageProps = undefined;
    await act(async () => {
      renderer = create(<PaintingViewerScreen />);
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('renders the single gallery item matching the route params, with no pager', () => {
    expect(mockCurrentPaintingId).toBe('painting-1');
    expect(mockViewerImageProps).toEqual({
      sourceKey: 'painting-1:file-1',
      uri: 'file:///file-1.png',
    });
  });

  it('switches to another gallery item when the route params change, without remounting', async () => {
    mockSearchParams = { fileEntryId: 'file-2', paintingId: 'painting-2' };
    await act(async () => {
      renderer?.update(<PaintingViewerScreen />);
    });

    expect(mockCurrentPaintingId).toBe('painting-2');
    expect(mockViewerImageProps).toEqual({
      sourceKey: 'painting-2:file-2',
      uri: 'file:///file-2.png',
    });
  });
});

function createGalleryItem(paintingId: string, fileEntryId: string): PaintingGalleryItem {
  return {
    aspectRatio: 1,
    fileEntryId,
    key: `${paintingId}:${fileEntryId}`,
    painting: {
      createdAt: '2026-07-21T00:00:00.000Z',
      files: { input: [], output: [fileEntryId] },
      id: paintingId,
      modelId: 'provider::model',
      orderKey: paintingId,
      prompt: paintingId,
      providerId: 'provider',
      updatedAt: '2026-07-21T00:00:00.000Z',
    },
    uri: `file:///${fileEntryId}.png`,
  };
}
