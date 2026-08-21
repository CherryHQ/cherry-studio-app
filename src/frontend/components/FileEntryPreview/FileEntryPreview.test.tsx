import { act, create } from 'react-test-renderer';

import { FileEntrySchema } from '@/shared/data/types/file';

import { FileEntryPreview } from './FileEntryPreview';

const mockAlertShow = jest.fn();
const mockFilePreview = jest.fn((_props: Record<string, unknown>) => null);
const mockLoggerWarn = jest.fn();
const mockUseResolvedFile = jest.fn();

jest.mock('@cherrystudio/ui/components', () => ({
  FilePreview: (props: Record<string, unknown>) => mockFilePreview(props),
  useAlert: () => ({ alert: { show: mockAlertShow } }),
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
          revision: 42,
          uri: 'file:///documents/image.png',
        },
        isLoading: false,
        labels: {
          loading: 'filePreview.loading',
          openWith: 'filePreview.openWith',
          unavailable: 'filePreview.unavailable',
        },
        size: 160,
      }),
    );
  });

  it('logs all preview errors and alerts only when opening fails', () => {
    act(() => {
      create(<FileEntryPreview entryId={entry.id} />);
    });
    const onError = mockFilePreview.mock.calls[0]?.[0].onError as
      | ((error: Error, operation: 'open' | 'thumbnail') => void)
      | undefined;
    const thumbnailError = new Error('thumbnail failed');
    const openError = new Error('open failed');

    act(() => onError?.(thumbnailError, 'thumbnail'));
    expect(mockAlertShow).not.toHaveBeenCalled();

    act(() => onError?.(openError, 'open'));
    expect(mockLoggerWarn).toHaveBeenNthCalledWith(
      1,
      'File preview operation failed',
      thumbnailError,
      { entryId: entry.id, operation: 'thumbnail' },
    );
    expect(mockLoggerWarn).toHaveBeenNthCalledWith(2, 'File preview operation failed', openError, {
      entryId: entry.id,
      operation: 'open',
    });
    expect(mockAlertShow).toHaveBeenCalledWith({ title: 'filePreview.openFailed' });
  });
});
