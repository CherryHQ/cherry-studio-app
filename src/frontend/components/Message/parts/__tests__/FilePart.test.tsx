import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { FilePart } from '../FilePart';

jest.mock('@/frontend/components/FileEntryPreview', () => {
  const { createElement } = jest.requireActual('react');
  return {
    FileEntryPreview: (props: object) => createElement('FileEntryPreview', props),
  };
});

describe('FilePart', () => {
  test('delegates managed attachments to FileEntryPreview', () => {
    const part = {
      ...filePart('application/pdf'),
      providerMetadata: {
        cherry: { fileEntryId: '00000000-0000-7000-8000-000000000001' },
      },
    };
    const renderer = render(<FilePart part={part} />);

    expect(renderer.root.findByType('FileEntryPreview').props.entryId).toBe(
      '00000000-0000-7000-8000-000000000001',
    );
  });

  test('does not render unmanaged attachments', () => {
    const renderer = render(<FilePart part={filePart('application/pdf')} />);

    expect(renderer.toJSON()).toBeNull();
  });
});

function render(element: ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  if (!renderer) {
    throw new Error('Renderer was not created');
  }
  return renderer;
}

function filePart(mediaType: string): Extract<CherryMessagePart, { type: 'file' }> {
  return {
    filename: 'brief.pdf',
    mediaType,
    type: 'file',
    url: 'file:///old-sandbox/brief.pdf',
  };
}
