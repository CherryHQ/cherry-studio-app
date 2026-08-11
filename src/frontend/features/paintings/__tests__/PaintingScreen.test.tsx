import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PaintingScreen } from '../PaintingScreen';

const mockSetParams = jest.fn();
const mockConsumePaintingDraftHandoff = jest.fn();
const mockUsePainting = jest.fn();
const mockUseResolvedPaintingFiles = jest.fn();
let mockParams: { handoff?: string; paintingId?: string } = {};
let mockComposerProviderProps:
  | {
      initialAttachments?: readonly unknown[];
      initialDraft?: string;
    }
  | undefined;
let mockPaintingComposerProps:
  | {
      onReceipt?: (paintingId: string | undefined) => void;
    }
  | undefined;

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ setParams: mockSetParams }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));

jest.mock('@/frontend/components/composer', () => ({
  ManagedComposerProvider: ({ children, ...props }: { children?: React.ReactNode }) => {
    mockComposerProviderProps = props;
    return children;
  },
}));

jest.mock('@/frontend/hooks/useThemeColor', () => ({
  useThemeColor: () => '#000000',
}));

jest.mock('../components/PaintingComposer', () => ({
  PaintingComposer: (props: typeof mockPaintingComposerProps) => {
    mockPaintingComposerProps = props;
    return null;
  },
}));

jest.mock('../hooks/usePaintings', () => ({
  usePainting: (...args: unknown[]) => mockUsePainting(...args),
  useResolvedPaintingFiles: (...args: unknown[]) => mockUseResolvedPaintingFiles(...args),
}));

jest.mock('../utils/paintingDraftHandoff', () => ({
  consumePaintingDraftHandoff: (...args: unknown[]) => mockConsumePaintingDraftHandoff(...args),
}));

describe('PaintingScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    mockComposerProviderProps = undefined;
    mockPaintingComposerProps = undefined;
    mockUsePainting.mockReturnValue({ data: undefined, isLoading: false });
    mockUseResolvedPaintingFiles.mockReturnValue({ data: undefined, isLoading: false });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('keeps the handoff composer mounted while its new receipt loads', () => {
    const handoffAttachment = {
      id: 'painting-file:source',
      kind: 'image',
      mediaType: 'image/png',
      name: 'source.png',
      uri: 'file:///source.png',
    };
    mockParams = { handoff: 'handoff-2', paintingId: 'source-1' };
    mockConsumePaintingDraftHandoff.mockReturnValueOnce({
      attachments: [handoffAttachment],
      draft: '',
    });
    mockUsePainting.mockReturnValue({
      data: { id: 'source-1', prompt: 'source prompt' },
      isLoading: false,
    });

    act(() => {
      renderer = create(<PaintingScreen />);
    });

    expect(mockPaintingComposerProps).toBeDefined();
    expect(mockComposerProviderProps).toEqual({
      initialAttachments: [handoffAttachment],
      initialDraft: '',
    });
    act(() => {
      mockPaintingComposerProps?.onReceipt?.('receipt-2');
    });
    expect(mockSetParams).toHaveBeenCalledWith({ paintingId: 'receipt-2' });

    mockParams = { paintingId: 'receipt-2' };
    mockPaintingComposerProps = undefined;
    mockUsePainting.mockReturnValue({ data: undefined, isLoading: true });

    act(() => {
      renderer?.update(<PaintingScreen />);
    });

    expect(mockPaintingComposerProps).toBeDefined();
  });

  it('restores persisted inputs when opening a receipt without a handoff', () => {
    const persistedInput = {
      fileEntryId: '00000000-0000-7000-8000-000000000002',
      id: 'painting-file:persisted',
      kind: 'image',
      mediaType: 'image/png',
      name: 'persisted.png',
      status: 'ready',
      uri: 'file:///persisted.png',
    };
    mockParams = { paintingId: 'receipt-2' };
    mockUsePainting.mockReturnValue({
      data: { id: 'receipt-2', prompt: 'retry this edit' },
      isLoading: false,
    });
    mockUseResolvedPaintingFiles.mockReturnValue({
      data: { inputs: [persistedInput], outputs: [] },
      isLoading: false,
    });

    act(() => {
      renderer = create(<PaintingScreen />);
    });

    expect(mockComposerProviderProps).toEqual({
      initialAttachments: [persistedInput],
      initialDraft: 'retry this edit',
    });
  });
});
