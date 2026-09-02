import { act, create } from 'react-test-renderer';

import type { ComposerAttachmentReady } from '../../utils/composerAttachments';
import { ComposerAttachmentStrip } from '../ComposerAttachmentStrip';

jest.mock('@cherrystudio/app-icons/icons/x', () => () => null);
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/components/FileEntryPreview', () => {
  const React = jest.requireActual('react');
  return {
    FileEntryPreview: (props: object) => React.createElement('FileEntryPreview', props),
  };
});

const attachment: ComposerAttachmentReady = {
  fileEntryId: '00000000-0000-7000-8000-000000000001',
  id: 'attachment-1',
  kind: 'image',
  mediaType: 'image/png',
  name: 'image.png',
  status: 'ready',
  uri: 'file:///documents/image.png',
};

describe('ComposerAttachmentStrip', () => {
  it('renders ready managed attachments through FileEntryPreview', () => {
    const renderer = createRenderer();

    expect(renderer.root.findByType('FileEntryPreview').props.entryId).toBe(attachment.fileEntryId);
  });
});

function createRenderer() {
  let renderer: ReturnType<typeof create> | undefined;
  act(() => {
    renderer = create(
      <ComposerAttachmentStrip attachments={[attachment]} onAttachmentRemove={jest.fn()} />,
    );
  });
  if (!renderer) {
    throw new Error('Renderer was not created');
  }
  return renderer;
}
