import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Painting } from '@/data/types/painting';

import { DrawingList } from '../DrawingList';

const mockToggleId = jest.fn();
const mockPush = jest.fn();
let mockIsEditing = false;
let mockSelectedIds: ReadonlySet<string> = new Set();

const mockPaintingOne = { id: 'painting-1' } as Painting;
const mockPaintingTwo = { id: 'painting-2' } as Painting;
const defaultGalleryItems = [
  {
    aspectRatio: 1,
    fileEntryId: 'file-1',
    key: 'painting-1:file-1',
    painting: mockPaintingOne,
    uri: 'file:///file-1.png',
  },
  {
    aspectRatio: 1,
    fileEntryId: 'file-2',
    key: 'painting-1:file-2',
    painting: mockPaintingOne,
    uri: 'file:///file-2.png',
  },
  {
    aspectRatio: 1,
    fileEntryId: 'file-3',
    key: 'painting-2:file-3',
    painting: mockPaintingTwo,
    uri: 'file:///file-3.png',
  },
];
let mockGalleryItems = defaultGalleryItems;

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

jest.mock('expo-media-library', () => ({
  addListener: jest.fn(() => ({ remove: jest.fn() })),
  Asset: class {},
  getPermissionsAsync: jest.fn(async () => ({ canAskAgain: false, granted: false })),
  requestPermissionsAsync: jest.fn(async () => ({ canAskAgain: false, granted: false })),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('heroui-native/toast', () => ({
  useToast: () => ({ toast: { show: jest.fn() } }),
}));

jest.mock('lucide-uniwind/png', () => ({
  CheckIcon: () => null,
  ImageIcon: () => null,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('react-native-reanimated', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: { View: MockView },
    FadeIn: { duration: () => undefined },
    FadeOut: { duration: () => undefined },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('@/components/nativePrimitives', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { Image: () => <MockView testID="drawing-image" /> };
});

jest.mock('@/components/navigation', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    PaintingZoomLink: ({ children }: { children?: React.ReactNode }) => (
      <MockView testID="painting-zoom-link">{children}</MockView>
    ),
  };
});

jest.mock('@/hooks/paintings', () => ({
  usePaintingGalleryItems: () => ({ data: mockGalleryItems, isLoading: false }),
  usePaintings: () => ({
    isLoading: false,
    isLoadingMore: false,
    loadMore: jest.fn(),
    paintings: [],
  }),
}));

jest.mock('@/features/chat/input/hooks/useChatInputPhotoPicker', () => ({
  CHAT_INPUT_PHOTO_SELECTION_LIMIT: 6,
  loadPhotoPreviewPage: jest.fn(),
}));

jest.mock('@/features/chat/input/utils/chatInputAttachments', () => ({
  createPhotoAttachmentDraft: jest.fn(),
}));

jest.mock('@/screens/PaintingScreen/utils/paintingDraftHandoff', () => ({
  createPaintingDraftHandoff: jest.fn(() => 'handoff'),
}));

jest.mock('@/components/messageTabs', () => ({
  useMessageListBottomInset: () => 0,
  useMessageScope: () => ({ scope: 'drawings' }),
  useMessageSelectionActions: () => ({ toggleId: mockToggleId }),
  useMessageSelectionState: () => ({ isEditing: mockIsEditing, selectedIds: mockSelectedIds }),
  useRegisterSelectionSource: () => undefined,
}));

jest.mock('@/screens/PaintingScreen/hooks/usePaintingSelectionSource', () => ({
  usePaintingSelectionSource: () => ({
    copy: { deleteFailed: '', deleteMessage: '', deleteTitle: '' },
    deleteSelected: jest.fn(),
    getAllIds: () => [],
  }),
}));

jest.mock('@/screens/PaintingScreen/templates', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    PaintingTemplateRow: () => <MockView testID="painting-template-row" />,
    toPaintingTemplateDraft: jest.fn(),
  };
});

describe('DrawingList', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGalleryItems = defaultGalleryItems;
    mockIsEditing = false;
    mockSelectedIds = new Set();
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  async function render() {
    await act(async () => {
      renderer = create(<DrawingList />);
    });

    if (!renderer) {
      throw new Error('DrawingList test renderer was not created.');
    }

    return renderer;
  }

  // findAllByProps also matches composite wrappers; count host nodes only.
  function findHostsByTestID(tree: ReactTestRenderer, testID: string) {
    return tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === testID,
    );
  }

  it('links every drawing to the viewer alongside photos and templates by default', async () => {
    const tree = await render();

    expect(findHostsByTestID(tree, 'painting-photos-view-all')).toHaveLength(1);
    expect(findHostsByTestID(tree, 'painting-template-row')).toHaveLength(1);
    expect(findHostsByTestID(tree, 'painting-zoom-link')).toHaveLength(mockGalleryItems.length);
  });

  it('hides photos and templates while editing and toggles selection on tap', async () => {
    mockIsEditing = true;

    const tree = await render();

    expect(findHostsByTestID(tree, 'painting-photos-view-all')).toHaveLength(0);
    expect(findHostsByTestID(tree, 'painting-template-row')).toHaveLength(0);
    expect(findHostsByTestID(tree, 'painting-zoom-link')).toHaveLength(0);

    const [firstItem] = tree.root.findAll(
      (node) =>
        node.props.testID === 'painting-history-painting-1:file-1' &&
        typeof node.props.onPress === 'function',
    );
    await act(async () => firstItem.props.onPress());

    expect(mockToggleId).toHaveBeenCalledWith('painting-1');
  });

  it('marks every output of a selected painting as checked', async () => {
    mockIsEditing = true;
    mockSelectedIds = new Set(['painting-1']);

    const tree = await render();

    const checkedTestIDs = tree.root
      .findAll((node) => typeof node.type === 'string' && node.props.testID != null)
      .filter((node) => node.props.accessibilityState?.checked === true)
      .map((node) => node.props.testID);
    expect(checkedTestIDs.sort()).toEqual([
      'painting-history-painting-1:file-1',
      'painting-history-painting-1:file-2',
    ]);
    const [otherItem] = findHostsByTestID(tree, 'painting-history-painting-2:file-3');
    expect(otherItem.props.accessibilityState).toEqual({ checked: false });
  });

  it('offers the same create action when the drawing history is empty', async () => {
    mockGalleryItems = [];

    const tree = await render();
    const [createButton] = tree.root.findAll(
      (node) =>
        node.props.testID === 'painting-history-create' && typeof node.props.onPress === 'function',
    );
    await act(async () => createButton.props.onPress());

    expect(createButton.props.accessibilityLabel).toBe('painting.history.create');
    expect(mockPush).toHaveBeenCalledWith('/paintings');
  });
});
