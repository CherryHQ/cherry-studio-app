import { FileEntrySchema } from '@cherrystudio/universal/data/types/file';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FilePreview } from './FilePreview.ios';

const mockPreviewFile = jest.fn();
const mockUseResolvedFile = jest.fn();

jest.mock('@magrinj/expo-quick-look', () => ({
  __esModule: true,
  default: { previewFile: (input: unknown) => mockPreviewFile(input) },
}));
jest.mock('@/frontend/components/AlertProvider', () => ({
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
jest.mock('./components/QuickLookPreview/QuickLookPreview.ios', () => {
  const React = jest.requireActual('react');
  return { QuickLookPreview: (props: object) => React.createElement('QuickLookPreview', props) };
});
jest.mock('./components/FallbackPreview/FallbackPreview', () => ({
  FallbackPreview: () => null,
}));
jest.mock('./components/FallbackPreview/FilePreviewLoading', () => ({
  FilePreviewLoading: () => null,
}));
jest.mock('./components/FallbackPreview/FilePreviewUnavailable', () => ({
  FilePreviewUnavailable: () => null,
}));

describe('FilePreview.ios', () => {
  beforeEach(() => {
    mockPreviewFile.mockReset();
    mockPreviewFile.mockResolvedValue(undefined);
    mockUseResolvedFile.mockReset();
  });

  it('routes images to ImagePreview and documents to QuickLookPreview', () => {
    mockUseResolvedFile.mockReturnValue(resolved('jpg'));
    const imageRenderer = render(<FilePreview entryId={entry.id} />);
    expect(imageRenderer.root.findAllByType('ImagePreview')).toHaveLength(1);

    mockUseResolvedFile.mockReturnValue(resolved('pptx'));
    const documentRenderer = render(<FilePreview entryId={entry.id} />);
    expect(documentRenderer.root.findAllByType('QuickLookPreview')).toHaveLength(1);
  });

  it('opens Quick Look with editing disabled', async () => {
    mockUseResolvedFile.mockReturnValue(resolved('pdf'));
    const renderer = render(<FilePreview entryId={entry.id} />);

    await act(async () => renderer.root.findByType('FilePreviewFrame').props.onPress());
    expect(mockPreviewFile).toHaveBeenCalledWith({
      editingMode: 'disabled',
      uri: 'file:///documents/file.pdf',
    });
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
