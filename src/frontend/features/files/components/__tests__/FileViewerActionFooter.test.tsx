import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { FileEntrySchema } from '@/shared/data/types/file';

import type { FileViewerSource } from '../../fileViewerSource';
import { resolveFileViewerFooterActions } from '../../utils/fileViewerFooterActions';
import { FileViewerActionFooter } from '../FileViewerActionFooter';

const mockShare = jest.fn(async () => {});
let mockIsSharing = false;
const mockUseShareFile = jest.fn((_file: unknown) => ({
  isSharing: mockIsSharing,
  share: mockShare,
}));

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  return {
    Button: ({ children, ...props }: Record<string, unknown>) =>
      React.createElement('Button', props, children),
  };
});
jest.mock('@cherrystudio/app-icons/icons/download', () => {
  const React = jest.requireActual('react');
  return function MockDownloadIcon() {
    return React.createElement('DownloadIcon');
  };
});
jest.mock('@/frontend/appShell/sharing', () => ({
  useShareFile: (file: unknown) => mockUseShareFile(file),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 0 }),
}));

const managedTextFile: FileViewerSource = {
  kind: 'managed',
  entry: FileEntrySchema.parse({
    createdAt: 1,
    filename: 'notes.md',
    id: '00000000-0000-7000-8000-000000000001',
    mediaType: 'text/markdown',
    provenance: 'generated',
    size: 12,
    updatedAt: 2,
  }),
  uri: 'file:///managed/notes.md',
};

const managedImageFile: FileViewerSource = {
  kind: 'managed',
  entry: FileEntrySchema.parse({
    createdAt: 1,
    filename: 'picture.png',
    id: '00000000-0000-7000-8000-000000000002',
    mediaType: 'image/png',
    provenance: 'generated',
    size: 100,
    updatedAt: 3,
  }),
  uri: 'file:///managed/picture.png',
};

const temporaryImageFile: FileViewerSource = {
  kind: 'temporary',
  entry: {
    filename: 'temp.png',
    id: 'temp-1',
    mediaType: 'image/png',
    provenance: 'unknown',
    size: 50,
    updatedAt: 4,
  },
  uri: 'file:///cache/temp.png',
};

const temporaryTextFile: FileViewerSource = {
  kind: 'temporary',
  entry: {
    filename: 'temp.txt',
    id: 'temp-2',
    mediaType: 'text/plain',
    provenance: 'unknown',
    size: 20,
    updatedAt: 5,
  },
  uri: 'file:///cache/temp.txt',
};

let renderer: ReactTestRenderer;

function buttons(tree: ReactTestRenderer): ReactTestInstance[] {
  return tree.root.findAllByType('Button' as never);
}

describe('FileViewerActionFooter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSharing = false;
  });

  afterEach(() => {
    if (renderer) {
      act(() => renderer.unmount());
    }
  });

  it('renders only Share for a managed chat non-image and invokes share', () => {
    const actions = resolveFileViewerFooterActions({
      canAddToChat: false,
      canShare: true,
      canSaveToPhotos: false,
    });

    act(() => {
      renderer = create(
        <FileViewerActionFooter
          actions={actions}
          file={managedTextFile}
          isResolvingAddToChat={false}
          onAddToChat={jest.fn()}
        />,
      );
    });

    expect(mockUseShareFile).toHaveBeenCalledWith(managedTextFile);
    const rendered = buttons(renderer);
    expect(rendered).toHaveLength(1);
    expect(rendered[0].props).toMatchObject({
      size: 'footer',
      testID: 'file-viewer-footer-share',
      variant: 'default',
    });
    expect(rendered[0].props.children).toBe('fileViewer.share');

    act(() => rendered[0].props.onPress());
    expect(mockShare).toHaveBeenCalledTimes(1);
  });

  it('renders Save to Photos (tonal) before Share (default) for a managed chat image', () => {
    const onSaveToPhotos = jest.fn();
    const actions = resolveFileViewerFooterActions({
      canAddToChat: false,
      canShare: true,
      canSaveToPhotos: true,
    });

    act(() => {
      renderer = create(
        <FileViewerActionFooter
          actions={actions}
          file={managedImageFile}
          isResolvingAddToChat={false}
          onAddToChat={jest.fn()}
          onSaveToPhotos={onSaveToPhotos}
        />,
      );
    });

    const rendered = buttons(renderer);
    expect(rendered).toHaveLength(2);
    expect(rendered[0].props).toMatchObject({
      children: 'sharing.saveToPhotos',
      size: 'footer',
      testID: 'file-viewer-footer-save-to-photos',
      variant: 'tonal',
    });
    expect(rendered[0].props.icon).toBeTruthy();
    expect(rendered[0].props.loading).toBeUndefined();
    expect(rendered[1].props).toMatchObject({
      children: 'fileViewer.share',
      size: 'footer',
      testID: 'file-viewer-footer-share',
      variant: 'default',
    });

    act(() => rendered[0].props.onPress());
    act(() => rendered[1].props.onPress());
    expect(onSaveToPhotos).toHaveBeenCalledTimes(1);
    expect(mockShare).toHaveBeenCalledTimes(1);
  });

  it('renders Share (tonal) before Add to current chat (default) for an external file with an eligible chat', () => {
    const onAddToChat = jest.fn();
    const actions = resolveFileViewerFooterActions({
      canAddToChat: true,
      canShare: true,
      canSaveToPhotos: true,
    });

    act(() => {
      renderer = create(
        <FileViewerActionFooter
          actions={actions}
          file={managedImageFile}
          isResolvingAddToChat={false}
          onAddToChat={onAddToChat}
          onSaveToPhotos={jest.fn()}
        />,
      );
    });

    const rendered = buttons(renderer);
    expect(rendered).toHaveLength(2);
    expect(rendered[0].props).toMatchObject({
      children: 'fileViewer.share',
      size: 'footer',
      testID: 'file-viewer-footer-share',
      variant: 'tonal',
    });
    expect(rendered[1].props).toMatchObject({
      children: 'fileViewer.addToChat',
      disabled: false,
      size: 'footer',
      testID: 'file-viewer-footer-add-to-chat',
      variant: 'default',
    });
    expect(rendered[1].props.loading).toBeUndefined();

    act(() => rendered[0].props.onPress());
    act(() => rendered[1].props.onPress());
    expect(mockShare).toHaveBeenCalledTimes(1);
    expect(onAddToChat).toHaveBeenCalledTimes(1);
  });

  it('renders Save to Photos (tonal) and Share (default) for an external image without an eligible chat', () => {
    const actions = resolveFileViewerFooterActions({
      canAddToChat: false,
      canShare: true,
      canSaveToPhotos: true,
    });

    act(() => {
      renderer = create(
        <FileViewerActionFooter
          actions={actions}
          file={managedImageFile}
          isResolvingAddToChat={false}
          onAddToChat={jest.fn()}
          onSaveToPhotos={jest.fn()}
        />,
      );
    });

    const rendered = buttons(renderer);
    expect(rendered.map((node) => [node.props.testID, node.props.variant])).toEqual([
      ['file-viewer-footer-save-to-photos', 'tonal'],
      ['file-viewer-footer-share', 'default'],
    ]);
  });

  it('renders only Save to Photos (default) for a temporary image without sharing authority', () => {
    const onSaveToPhotos = jest.fn();
    const actions = resolveFileViewerFooterActions({
      canAddToChat: false,
      canShare: false,
      canSaveToPhotos: true,
    });

    act(() => {
      renderer = create(
        <FileViewerActionFooter
          actions={actions}
          file={temporaryImageFile}
          isResolvingAddToChat={false}
          onAddToChat={jest.fn()}
          onSaveToPhotos={onSaveToPhotos}
        />,
      );
    });

    expect(mockUseShareFile).toHaveBeenCalledWith(undefined);
    const rendered = buttons(renderer);
    expect(rendered).toHaveLength(1);
    expect(rendered[0].props).toMatchObject({
      children: 'sharing.saveToPhotos',
      size: 'footer',
      testID: 'file-viewer-footer-save-to-photos',
      variant: 'default',
    });

    act(() => rendered[0].props.onPress());
    expect(onSaveToPhotos).toHaveBeenCalledTimes(1);
  });

  it('renders null for a temporary non-image when no footer actions apply', () => {
    const actions = resolveFileViewerFooterActions({
      canAddToChat: false,
      canShare: false,
      canSaveToPhotos: false,
    });

    act(() => {
      renderer = create(
        <FileViewerActionFooter
          actions={actions}
          file={temporaryTextFile}
          isResolvingAddToChat={false}
          onAddToChat={jest.fn()}
        />,
      );
    });

    expect(mockUseShareFile).toHaveBeenCalledWith(undefined);
    expect(renderer.toJSON()).toBeNull();
  });

  it('keeps Share and Add disabled/loading states independent', () => {
    const actions = resolveFileViewerFooterActions({
      canAddToChat: true,
      canShare: true,
      canSaveToPhotos: false,
    });

    act(() => {
      renderer = create(
        <FileViewerActionFooter
          actions={actions}
          file={managedTextFile}
          isResolvingAddToChat
          onAddToChat={jest.fn()}
        />,
      );
    });

    let rendered = buttons(renderer);
    expect(rendered[0].props).toMatchObject({
      disabled: false,
      loading: false,
      testID: 'file-viewer-footer-share',
    });
    expect(rendered[1].props).toMatchObject({
      disabled: true,
      testID: 'file-viewer-footer-add-to-chat',
    });
    expect(rendered[1].props.loading).toBeUndefined();

    mockIsSharing = true;
    act(() => {
      renderer.update(
        <FileViewerActionFooter
          actions={actions}
          file={managedTextFile}
          isResolvingAddToChat={false}
          onAddToChat={jest.fn()}
        />,
      );
    });

    rendered = buttons(renderer);
    expect(rendered[0].props).toMatchObject({
      disabled: true,
      loading: true,
      testID: 'file-viewer-footer-share',
    });
    expect(rendered[1].props).toMatchObject({
      disabled: false,
      testID: 'file-viewer-footer-add-to-chat',
    });
  });
});
