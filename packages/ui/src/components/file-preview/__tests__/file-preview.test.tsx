import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FileCardPreview } from '../components/file-card-preview';
import { FilePreview } from '../components/file-preview';
import { FilePreviewPluginProvider } from '../components/file-preview-plugin-provider';
import type { FilePreviewFile, FilePreviewKind, FilePreviewPlugin } from '../file-preview.types';

const onPress = jest.fn();

jest.mock('heroui-native/utils', () => {
  const { twMerge } = jest.requireActual('tailwind-merge');

  return {
    cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(' ')),
  };
});

jest.mock('../default-plugins/default-plugins', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    defaultFilePreviewFallback: (props: object) => React.createElement('DefaultFallback', props),
    defaultFilePreviewPlugins: [
      { component: (props: object) => React.createElement('BuiltInImage', props), kind: 'image' },
    ],
  };
});
jest.mock('../components/file-preview-frame', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return { FilePreviewFrame: (props: object) => React.createElement('FilePreviewFrame', props) };
});
jest.mock('../components/fallback-preview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    FallbackPreview: (props: object) => React.createElement('FallbackPreview', props),
    FilePreviewUnavailable: (props: object) => React.createElement('FilePreviewUnavailable', props),
  };
});
const labels = { openWith: 'Open with', unavailable: 'Unavailable' };
const pdfPlugins: readonly FilePreviewPlugin[] = [
  { component: (props) => createElement('PdfPreview', props), kind: 'pdf' },
];
const compactPdfPlugins: readonly FilePreviewPlugin[] = [
  { component: (props) => createElement('CompactPdfPreview', props), kind: 'pdf' },
];

describe('FilePreview', () => {
  beforeEach(() => {
    onPress.mockReset();
  });

  it('renders the plugin registered for the file kind', () => {
    const renderer = render(<FilePreview file={file('image')} labels={labels} onPress={onPress} />);

    expect(renderer.root.findAllByType('BuiltInImage')).toHaveLength(1);
  });

  it('falls back to the platform renderer for a kind no plugin claims', () => {
    const renderer = render(<FilePreview file={file('pdf')} labels={labels} onPress={onPress} />);

    expect(renderer.root.findAllByType('DefaultFallback')).toHaveLength(1);
  });

  it('uses the shared icon artwork instead of a platform thumbnail when requested', () => {
    const renderer = render(
      <FilePreview file={file('pdf')} labels={labels} onPress={onPress} variant="icon" />,
    );

    expect(renderer.root.findByType(FileCardPreview).props.variant).toBe('icon');
    expect(renderer.root.findAllByType('DefaultFallback')).toHaveLength(0);
  });

  it('keeps image thumbnails in the icon variant', () => {
    const renderer = render(
      <FilePreview file={file('image')} labels={labels} onPress={onPress} variant="icon" />,
    );

    expect(renderer.root.findAllByType('BuiltInImage')).toHaveLength(1);
    expect(renderer.root.findAllByType(FileCardPreview)).toHaveLength(0);
  });

  it('passes the resolved size and error reporter to the plugin', () => {
    const onError = jest.fn();
    const renderer = render(
      <FilePreview
        file={file('pdf')}
        labels={labels}
        onPress={onPress}
        onError={onError}
        size={0}
      />,
    );

    expect(renderer.root.findByType('DefaultFallback').props).toMatchObject({ onError, size: 1 });
  });

  it('lets a provider claim a kind and inherit the rest', () => {
    const renderer = render(
      <FilePreviewPluginProvider plugins={pdfPlugins}>
        <FilePreview file={file('pdf')} labels={labels} onPress={onPress} />
        <FilePreview file={file('image')} labels={labels} onPress={onPress} />
        <FilePreview file={file('text')} labels={labels} onPress={onPress} />
      </FilePreviewPluginProvider>,
    );

    expect(renderer.root.findAllByType('PdfPreview')).toHaveLength(1);
    expect(renderer.root.findAllByType('BuiltInImage')).toHaveLength(1);
    expect(renderer.root.findAllByType('DefaultFallback')).toHaveLength(1);
  });

  it('lets a nested provider override an outer plugin', () => {
    const renderer = render(
      <FilePreviewPluginProvider plugins={pdfPlugins}>
        <FilePreviewPluginProvider plugins={compactPdfPlugins}>
          <FilePreview file={file('pdf')} labels={labels} onPress={onPress} />
        </FilePreviewPluginProvider>
      </FilePreviewPluginProvider>,
    );

    expect(renderer.root.findAllByType('CompactPdfPreview')).toHaveLength(1);
    expect(renderer.root.findAllByType('PdfPreview')).toHaveLength(0);
  });

  it('delegates a valid press to the caller', () => {
    const renderer = render(<FilePreview file={file('pdf')} labels={labels} onPress={onPress} />);

    act(() => renderer.root.findByType('FilePreviewFrame').props.onPress());

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('disables the frame when no file resolved', () => {
    const renderer = render(<FilePreview labels={labels} onPress={onPress} />);

    expect(renderer.root.findAllByType('FilePreviewUnavailable')).toHaveLength(1);
    expect(renderer.root.findByType('FilePreviewFrame').props.disabled).toBe(true);
    act(() => renderer.root.findByType('FilePreviewFrame').props.onPress());
    expect(onPress).not.toHaveBeenCalled();
  });
});

function file(kind: FilePreviewKind): FilePreviewFile {
  return {
    displayName: 'brief.pdf',
    extensionLabel: 'PDF',
    id: 'file-1',
    kind,
    previewUri: 'file:///cache/brief.webp',
    revision: 42,
    uri: 'file:///documents/brief.pdf',
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
