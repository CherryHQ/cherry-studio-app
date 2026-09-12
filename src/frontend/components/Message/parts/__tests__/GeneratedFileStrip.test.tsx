import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { GeneratedFileStrip } from '../GeneratedFileStrip';

jest.mock('@/frontend/components/FileEntryPreview', () => {
  const { createElement } = jest.requireActual('react');
  return {
    FileEntryAttachment: (props: object) => createElement('FileEntryAttachment', props),
  };
});

describe('GeneratedFileStrip', () => {
  it('renders managed assistant artifacts with the horizontal attachment component', () => {
    const managed = filePart('managed.md', '00000000-0000-7000-8000-000000000001');
    const renderer = render(<GeneratedFileStrip parts={[managed, filePart('unmanaged.md')]} />);

    expect(renderer.root.findAllByType('FileEntryAttachment')).toHaveLength(1);
    expect(renderer.root.findByType('FileEntryAttachment').props.entryId).toBe(
      '00000000-0000-7000-8000-000000000001',
    );
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
