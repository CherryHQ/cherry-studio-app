import { FileEntrySchema } from '@cherrystudio/universal/data/types/file';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FilePreview } from './FilePreview.android';

const mockPreviewFile = jest.fn();
const mockUseResolvedFile = jest.fn();

jest.mock('@magrinj/expo-quick-look', () => ({
  __esModule: true,
  default: { previewFile: (input: unknown) => mockPreviewFile(input) },
}));

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { show: jest.fn() } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('./hooks/useResolvedFile', () => ({
  useResolvedFile: (entryId: string) => mockUseResolvedFile(entryId),
}));
jest.mock('./components/FilePreviewFrame/FilePreviewFrame', () => {
  const React = jest.requireActual('react');
  return {
    FilePreviewFrame: (props: object) => React.createElement('FilePreviewFrame', props),
  };
});
jest.mock('./components/ImagePreview/ImagePreview', () => {
  const React = jest.requireActual('react');
  return { ImagePreview: (props: object) => React.createElement('ImagePreview', props) };
});
jest.mock('./components/FallbackPreview/FallbackPreview', () => {
  const React = jest.requireActual('react');
  return { FallbackPreview: (props: object) => React.createElement('FallbackPreview', props) };
});
jest.mock('./components/FallbackPreview/FilePreviewLoading', () => ({
  FilePreviewLoading: () => null,
}));
jest.mock('./components/FallbackPreview/FilePreviewUnavailable', () => ({
  FilePreviewUnavailable: () => null,
}));

describe('FilePreview.android', () => {
  beforeEach(() => {
    mockPreviewFile.mockReset();
    mockPreviewFile.mockResolvedValue(undefined);
    mockUseResolvedFile.mockReset();
  });

  it('renders images directly and opens them with the Android chooser', async () => {
    mockUseResolvedFile.mockReturnValue(resolved('png'));
    const renderer = render(<FilePreview entryId={entry.id} />);

    expect(renderer.root.findAllByType('ImagePreview')).toHaveLength(1);
    await act(async () => renderer.root.findByType('FilePreviewFrame').props.onPress());
    expect(mockPreviewFile).toHaveBeenCalledWith({
      chooserTitle: 'filePreview.openWith',
      uri: 'file:///documents/file.png',
    });
  });

  it('keeps non-image documents on the generic fallback', () => {
    mockUseResolvedFile.mockReturnValue(resolved('pdf'));
    const renderer = render(<FilePreview entryId={entry.id} size={160} />);

    expect(renderer.root.findAllByType('FallbackPreview')).toHaveLength(1);
    expect(renderer.root.findByType('FilePreviewFrame').props.size).toBe(160);
  });
});

const entry = FileEntrySchema.parse({
  cleanupPolicy: 'manual',
  contentHash: null,
  createdAt: 1,
  ext: 'png',
  id: '00000000-0000-7000-8000-000000000001',
  name: 'file',
  origin: 'internal',
  size: 1,
  updatedAt: 1,
});

function resolved(ext: string) {
  return {
    data: { entry: { ...entry, ext }, uri: `file:///documents/file.${ext}` },
    isLoading: false,
  };
}

function render(element: React.ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  if (!renderer) {
    throw new Error('Renderer was not created');
  }
  return renderer;
}
