import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ComposerAttachmentReady } from '@/frontend/components/Composer/utils/composerAttachments';

import { type PaintingReferenceImage, usePaintingReference } from '../usePaintingReference';

const image = (id: string): PaintingReferenceImage => ({
  fileEntryId: id,
  mediaType: 'image/png',
  name: `${id}.png`,
});
const attachment = (id: string): ComposerAttachmentReady => ({
  ...image(id),
  id,
  kind: 'image',
  status: 'ready',
  uri: `file:///${id}.png`,
});
type Props = { ids: string[]; draft?: string; attachments?: ComposerAttachmentReady[] };
const noAttachments: ComposerAttachmentReady[] = [];

describe('painting reference intent', () => {
  let renderer: ReactTestRenderer;
  let reference: ReturnType<typeof usePaintingReference>;
  function Probe({ ids, draft = '', attachments = noAttachments }: Props) {
    reference = usePaintingReference(
      { id: ids.join(','), images: ids.map(image) },
      draft,
      attachments,
    );
    return null;
  }
  const update = (props: Props, key = 'session-1') =>
    act(() => renderer.update(<Probe {...props} key={key} />));
  beforeEach(() => {
    act(() => {
      renderer = create(<Probe ids={[]} key="session-1" />);
    });
  });
  afterEach(() => act(() => renderer.unmount()));

  it('preserves dismissal across refresh and adopts a new result', () => {
    update({ ids: ['first'] });
    expect(reference.selection?.image.fileEntryId).toBe('first');
    act(() => reference.clear());
    update({ ids: ['first'] });
    expect(reference.selection).toBeUndefined();
    update({ ids: ['second'] });
    expect(reference.selection?.image.fileEntryId).toBe('second');
  });

  it('leaves multiple results as optional candidates until explicitly selected', () => {
    update({ ids: ['first', 'second'] });
    expect(reference.selection).toBeUndefined();
    expect(reference.isPickerOpen).toBe(true);
    act(() => reference.select(image('second')));
    update({ ids: ['first', 'second'] });
    expect(reference.selection).toEqual({ image: image('second'), origin: 'explicit' });
    expect(reference.isPickerOpen).toBe(false);
  });

  it('lets manual attachments replace automatic references without resurrecting them on removal', () => {
    update({ ids: ['first'] });
    update({ ids: ['first'], attachments: [attachment('manual')] });
    expect(reference.selection).toBeUndefined();
    update({ ids: ['first'] });
    expect(reference.selection).toBeUndefined();
  });

  it('keeps explicit reference choices when extra manual images arrive', () => {
    update({ ids: ['first'] });
    act(() => reference.select(image('first')));
    update({ ids: ['first'], attachments: [attachment('manual')] });
    expect(reference.selection?.image.fileEntryId).toBe('first');
  });

  it('does not replace the editing target when the next draft was edited during generation', () => {
    update({ ids: ['first'] });
    act(() => reference.beginSubmission([attachment('first')]));
    update({ ids: ['first'], draft: 'Next edit' });
    update({ ids: ['second'], draft: 'Next edit' });
    expect(reference.selection?.image.fileEntryId).toBe('first');
    expect(reference.images[0].fileEntryId).toBe('second');
  });

  it('preserves input intent even when the user clears the next draft before completion', () => {
    update({ ids: ['first'] });
    act(() => reference.beginSubmission([attachment('first')]));
    update({ ids: ['first'], draft: 'Next edit' });
    update({ ids: ['first'] });
    update({ ids: ['second'] });
    expect(reference.selection?.image.fileEntryId).toBe('first');
  });

  it('adopts a successful result when the next input was untouched', () => {
    update({ ids: ['first'] });
    act(() => reference.beginSubmission([attachment('first')]));
    update({ ids: ['second'] });
    expect(reference.selection?.image.fileEntryId).toBe('second');
  });

  it('keeps a submitted manual reference on failure and isolates a different composer', () => {
    act(() => reference.beginSubmission([attachment('manual')]));
    act(() => reference.rejectSubmission());
    expect(reference.selection?.image.fileEntryId).toBe('manual');
    update({ ids: [] }, 'session-2');
    expect(reference.selection).toBeUndefined();
  });
});
