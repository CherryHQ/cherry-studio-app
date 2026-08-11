import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PaintingScreen } from '../PaintingScreen';

const mockSetParams = jest.fn();
const mockConsumePaintingDraftHandoff = jest.fn();
const mockUsePainting = jest.fn();
const mockUseResolvedPaintingFiles = jest.fn();
let mockParams: { handoff?: string; paintingId?: string } = {};
let mockScreenOptions: Record<string, unknown> | undefined;
let mockPaintingComposerProps:
  | {
      initialAttachments: readonly unknown[];
      initialDraft: string;
      isHandoff: boolean;
      onReceipt?: (paintingId: string | undefined) => void;
    }
  | undefined;

jest.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options: Record<string, unknown> }) => {
      mockScreenOptions = options;
      return null;
    },
  },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ setParams: mockSetParams }),
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
    mockPaintingComposerProps = undefined;
    mockScreenOptions = undefined;
    mockUsePainting.mockReturnValue({ data: undefined, isLoading: false });
    mockUseResolvedPaintingFiles.mockReturnValue({ data: undefined, isLoading: false });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('inherits the transparent root header without painting an opaque background', () => {
    act(() => {
      renderer = create(<PaintingScreen />);
    });

    expect(mockScreenOptions).toMatchObject({
      headerBackButtonDisplayMode: 'minimal',
      title: '',
    });
    expect(mockScreenOptions).not.toHaveProperty('headerStyle');
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
      data: { files: { input: [], output: ['output-1'] }, id: 'source-1', prompt: 'source prompt' },
      isLoading: false,
    });

    act(() => {
      renderer = create(<PaintingScreen />);
    });

    expect(mockPaintingComposerProps).toBeDefined();
    expect(mockPaintingComposerProps).toMatchObject({
      initialAttachments: [handoffAttachment],
      initialDraft: '',
      isHandoff: true,
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

  it('keeps persisted inputs in the user message instead of restoring the composer', () => {
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
      data: {
        files: { input: ['input-1'], output: [] },
        id: 'receipt-2',
        prompt: 'retry this edit',
      },
      isLoading: false,
    });
    mockUseResolvedPaintingFiles.mockReturnValue({
      data: { inputs: [persistedInput], outputs: [] },
      isLoading: false,
    });

    act(() => {
      renderer = create(<PaintingScreen />);
    });

    expect(mockPaintingComposerProps).toMatchObject({
      initialAttachments: [],
      initialDraft: '',
      isHandoff: false,
    });
  });

  it('keeps the composer empty when opening a completed painting', () => {
    mockParams = { paintingId: 'painting-1' };
    mockUsePainting.mockReturnValue({
      data: {
        files: { input: ['input-1'], output: ['output-1'] },
        id: 'painting-1',
        prompt: 'finished prompt',
      },
      isLoading: false,
    });
    mockUseResolvedPaintingFiles.mockReturnValue({
      data: { inputs: [{ id: 'input-1' }], outputs: [{ id: 'output-1' }] },
      isLoading: false,
    });

    act(() => {
      renderer = create(<PaintingScreen />);
    });

    expect(mockPaintingComposerProps).toMatchObject({
      initialAttachments: [],
      initialDraft: '',
      isHandoff: false,
    });
  });
});
