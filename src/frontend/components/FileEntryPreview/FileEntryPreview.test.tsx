import { act, create } from 'react-test-renderer';

import { FileEntrySchema } from '@/shared/data/types/file';

import { FileEntryAttachment, FileEntryPreview, LoadedFileEntryPreview } from './FileEntryPreview';

const mockFileAttachmentPreview = jest.fn((_props: Record<string, unknown>) => null);
const mockFilePreview = jest.fn((_props: Record<string, unknown>) => null);
const mockLoggerWarn = jest.fn();
const mockSkeleton = jest.fn((_props: Record<string, unknown>) => null);
const mockUseResolvedFile = jest.fn();
const mockFileEntryImage = jest.fn((_props: Record<string, unknown>) => null);

jest.mock('@cherrystudio/ui/components', () => ({
  FileAttachmentPreview: (props: Record<string, unknown>) => mockFileAttachmentPreview(props),
  FilePreview: (props: Record<string, unknown>) => mockFilePreview(props),
  Skeleton: (props: Record<string, unknown>) => mockSkeleton(props),
}));
jest.mock('./FileEntryImage', () => ({
  FileEntryImage: (props: Record<string, unknown>) => mockFileEntryImage(props),
}));
jest.mock('./hooks/useOpenFileEntry', () => ({
  useOpenFileEntry: () => ({ openFileEntry: jest.fn() }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({ warn: (...args: unknown[]) => mockLoggerWarn(...args) }),
  },
}));
jest.mock('./hooks/useResolvedFile', () => ({
  useResolvedFile: (entryId: string) => mockUseResolvedFile(entryId),
}));

const entry = FileEntrySchema.parse({
  createdAt: 1,
  filename: 'image.png',
  id: '00000000-0000-7000-8000-000000000001',
  mediaType: 'image/png',
  provenance: 'imported',
  size: 1,
  updatedAt: 42,
});

describe('FileEntryPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseResolvedFile.mockReturnValue({
      data: { entry, uri: 'file:///documents/image.png' },
      isLoading: false,
    });
  });

  it('adapts a managed file into the CherryUI descriptor', () => {
    act(() => {
      create(<FileEntryPreview entryId={entry.id} size={160} />);
    });

    expect(mockUseResolvedFile).toHaveBeenCalledWith(entry.id);
    expect(mockFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        file: {
          displayName: 'image.png',
          extensionLabel: 'PNG',
          id: entry.id,
          kind: 'image',
          previewUri: undefined,
          revision: 42,
          uri: 'file:///documents/image.png',
        },
        labels: {
          openWith: 'filePreview.openWith',
          unavailable: 'filePreview.unavailable',
        },
        size: 160,
      }),
    );
  });

  it('uses the URI supplied with an already-loaded entry', () => {
    act(() => {
      create(
        <LoadedFileEntryPreview
          entry={entry}
          previewUri="file:///cache/image.webp"
          size={160}
          uri="file:///documents/image.png"
        />,
      );
    });

    expect(mockUseResolvedFile).not.toHaveBeenCalled();
    expect(mockFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.objectContaining({
          id: entry.id,
          previewUri: 'file:///cache/image.webp',
          uri: 'file:///documents/image.png',
        }),
      }),
    );
  });

  it('keeps non-image assistant artifacts in a file row', () => {
    mockUseResolvedFile.mockReturnValue({
      data: { entry: { ...entry, mediaType: 'text/markdown' }, uri: 'file:///documents/image.png' },
      isLoading: false,
    });
    act(() => {
      create(<FileEntryAttachment entryId={entry.id} />);
    });

    expect(mockFileAttachmentPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryLabel: 'filePreview.document',
        file: expect.objectContaining({ id: entry.id, uri: 'file:///documents/image.png' }),
        labels: {
          openWith: 'filePreview.openWith',
          unavailable: 'filePreview.unavailable',
        },
      }),
    );
    expect(mockFilePreview).not.toHaveBeenCalled();
  });

  it('uses the shared file-entry skeleton while the entry resolves', () => {
    mockUseResolvedFile.mockReturnValue({ data: null, isLoading: true });

    act(() => {
      create(<FileEntryPreview entryId={entry.id} size={96} />);
    });

    expect(mockFilePreview).not.toHaveBeenCalled();
    expect(mockSkeleton).toHaveBeenCalledWith({
      style: { borderRadius: 16, height: 96, width: 96 },
    });
  });

  it('renders the stable unavailable placeholder when the entry or blob is missing', () => {
    mockUseResolvedFile.mockReturnValue({ data: null, isLoading: false });

    act(() => {
      create(<FileEntryPreview entryId={entry.id} />);
    });

    expect(mockFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        file: null,
        labels: expect.objectContaining({ unavailable: 'filePreview.unavailable' }),
      }),
    );
  });

  it('shows a generated image itself instead of a document row', () => {
    act(() => {
      create(<FileEntryAttachment entryId={entry.id} />);
    });
    expect(mockFileEntryImage).toHaveBeenCalledWith(
      expect.objectContaining({ entry, uri: 'file:///documents/image.png' }),
    );
    expect(mockFileAttachmentPreview).not.toHaveBeenCalled();
  });

  it('records thumbnail failures without changing the file surface', () => {
    act(() => {
      create(<FileEntryPreview entryId={entry.id} />);
    });
    const onError = mockFilePreview.mock.calls[0]?.[0].onError as (
      error: Error,
      operation: 'thumbnail',
    ) => void;
    const error = new Error('thumbnail failed');
    act(() => onError(error, 'thumbnail'));

    expect(mockLoggerWarn).toHaveBeenCalledWith('File preview operation failed', error, {
      entryId: entry.id,
      operation: 'thumbnail',
    });
  });
});
