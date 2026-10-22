import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { GeneratedFileStrip } from '../GeneratedFileStrip';

jest.mock('@cherrystudio/ui/components', () => ({
  BackgroundPressExclusion: (props: object) =>
    jest.requireActual('react').createElement('View', props),
  ContextMenuExclusion: (props: object) => jest.requireActual('react').createElement('View', props),
}));

const mockUseResolvedFile = jest.fn();

jest.mock('@/frontend/components/FileEntryPreview', () => {
  const { createElement } = jest.requireActual('react');
  return {
    FileEntryAttachment: (props: object) => createElement('FileEntryAttachment', props),
    useResolvedFile: (entryId: string) => mockUseResolvedFile(entryId),
  };
});

describe('GeneratedFileStrip', () => {
  beforeEach(() => {
    mockUseResolvedFile.mockReturnValue({
      data: { entry: {}, uri: 'file:///a' },
      isLoading: false,
    });
  });

  it('renders managed assistant artifacts with the horizontal attachment component', () => {
    const managed = filePart('managed.md', '00000000-0000-7000-8000-000000000001');
    const renderer = render(<GeneratedFileStrip parts={[managed, filePart('unmanaged.md')]} />);

    expect(renderer.root.findAllByType('FileEntryAttachment')).toHaveLength(1);
    expect(renderer.root.findByType('FileEntryAttachment').props.entryId).toBe(
      '00000000-0000-7000-8000-000000000001',
    );
  });

  it('leaves no block for an unavailable artifact, so the message column adds no gap', () => {
    const available = '00000000-0000-7000-8000-000000000001';
    const trashed = '00000000-0000-7000-8000-000000000002';
    mockUseResolvedFile.mockImplementation((entryId: string) =>
      entryId === trashed
        ? { data: null, isLoading: false }
        : { data: { entry: {}, uri: 'file:///a' }, isLoading: false },
    );
    const renderer = render(
      <GeneratedFileStrip
        parts={[filePart('trashed.md', trashed), filePart('kept.md', available)]}
      />,
    );

    expect(renderer.toJSON()).toMatchObject({ type: 'View' });
    expect(renderer.root.findByType('FileEntryAttachment').props.entryId).toBe(available);
  });

  it('keeps the block while the artifact resolves', () => {
    mockUseResolvedFile.mockReturnValue({ data: null, isLoading: true });
    const renderer = render(
      <GeneratedFileStrip
        parts={[filePart('pending.md', '00000000-0000-7000-8000-000000000001')]}
      />,
    );

    expect(renderer.root.findAllByType('FileEntryAttachment')).toHaveLength(1);
  });
});

function filePart(
  filename: string,
  fileEntryId?: string,
): Extract<CherryMessagePart, { type: 'file' }> {
  return {
    filename,
    mediaType: 'text/markdown',
    ...(fileEntryId ? { providerMetadata: { cherry: { fileEntryId } } } : {}),
    type: 'file',
    url: `cherry://file/${fileEntryId ?? filename}`,
  };
}

function render(element: React.ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  if (!renderer) throw new Error('Renderer was not created');
  return renderer;
}
