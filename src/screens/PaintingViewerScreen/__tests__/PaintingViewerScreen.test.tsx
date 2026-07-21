import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { PaintingGalleryItem } from '@/hooks/paintings';

import { PaintingViewerScreen } from '../PaintingViewerScreen';

type ViewerPagerProps = {
  onPageChange: (index: number) => void;
};

const mockRouterBack = jest.fn();
const mockRouterSetParams = jest.fn();
const mockLoadMore = jest.fn();
let mockCurrentPaintingId: string | undefined;
let mockSearchParams = { fileEntryId: 'file-1', paintingId: 'painting-1' };
let mockViewerPagerProps: ViewerPagerProps | undefined;

const mockItems: PaintingGalleryItem[] = [
  createGalleryItem('painting-1', 'file-1'),
  createGalleryItem('painting-2', 'file-2'),
  createGalleryItem('painting-3', 'file-3'),
];

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => ({ back: mockRouterBack, setParams: mockRouterSetParams }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('@/components/navigation', () => ({
  getPaintingZoomTransitionSourceId: (sourceKey: string) => `painting-gallery:${sourceKey}`,
  paintingZoomTransitionSourceIdParam: '__internal_expo_router_zoom_transition_source_id',
}));

jest.mock('@/config/constants', () => ({
  isIOS: true,
  paintingViewer: { aspectRatios: [] },
}));

jest.mock('@/hooks/paintings', () => ({
  usePaintingGalleryItems: () => ({ data: mockItems, isLoading: false }),
  usePaintings: () => ({ isLoading: false, loadMore: mockLoadMore, paintings: [] }),
}));

jest.mock('../components/PaintingViewerChrome', () => ({ PaintingViewerChrome: () => null }));

jest.mock('../components/ViewerPager', () => ({
  ViewerPager: (props: ViewerPagerProps) => {
    mockViewerPagerProps = props;
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
    mockViewerPagerProps = undefined;
    await act(async () => {
      renderer = create(<PaintingViewerScreen />);
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('retargets the iOS zoom transition when the visible page changes', async () => {
    await act(async () => {
      mockViewerPagerProps?.onPageChange(2);
    });

    expect(mockRouterSetParams).toHaveBeenCalledWith({
      __internal_expo_router_zoom_transition_source_id: 'painting-gallery:painting-3:file-3',
    });
  });

  it('resets the visible page when the same viewer route opens from another gallery item', async () => {
    await act(async () => {
      mockViewerPagerProps?.onPageChange(2);
    });
    expect(mockCurrentPaintingId).toBe('painting-3');

    mockSearchParams = { fileEntryId: 'file-2', paintingId: 'painting-2' };
    await act(async () => {
      renderer?.update(<PaintingViewerScreen />);
    });

    expect(mockCurrentPaintingId).toBe('painting-2');
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
