import { readCherryMeta } from '@/shared/data/types/uiParts';

import {
  appendComposerAttachments,
  type ComposerAttachmentReady,
  type ComposerAttachmentSource,
  createCameraAttachmentDraft,
  createComposerMessageParts,
  createDocumentAttachmentDraft,
  createPastedImageAttachmentDraft,
  createPhotoAttachmentDraft,
  hasComposerSendableContent,
  hasImportingComposerAttachments,
  isComposerAttachmentSupported,
  isComposerAttachmentReady,
  isComposerImageFileName,
  isComposerImageMediaType,
  removeComposerAttachment,
} from '../composerAttachments';

const transientFileAttachment: ComposerAttachmentSource = {
  id: 'file:file-a.pdf',
  kind: 'file',
  mediaType: 'application/pdf',
  name: 'file-a.pdf',
  uri: 'file-a.pdf',
};

const readyFileAttachment: ComposerAttachmentReady = {
  ...transientFileAttachment,
  fileEntryId: '00000000-0000-7000-8000-000000000001',
  status: 'ready',
};

describe('composer attachments', () => {
  test('appends attachments while preserving existing items and dropping duplicates', () => {
    const imageAttachment = createPhotoAttachmentDraft({ id: 'photo-a', uri: 'photo-a.jpg' });

    expect(
      appendComposerAttachments([imageAttachment], [transientFileAttachment, imageAttachment]),
    ).toEqual([imageAttachment, transientFileAttachment]);
  });

  test('removes an attachment by id', () => {
    const imageAttachment = createPhotoAttachmentDraft({ id: 'photo-a', uri: 'photo-a.jpg' });

    expect(
      removeComposerAttachment([imageAttachment, transientFileAttachment], imageAttachment.id),
    ).toEqual([transientFileAttachment]);
  });

  test('classifies document picker images as image attachments', () => {
    expect(
      createDocumentAttachmentDraft({
        lastModified: 0,
        mimeType: 'image/png',
        name: 'screen.png',
        uri: 'file://screen.png',
      }),
    ).toMatchObject({
      id: 'file:file://screen.png',
      kind: 'image',
      mediaType: 'image/png',
      name: 'screen.png',
    });
  });

  test('creates photo attachments with filename metadata', () => {
    expect(
      createPhotoAttachmentDraft({
        fileName: 'camera-shot.HEIC',
        id: 'photo-a',
        uri: 'file://photo-a.heic',
      }),
    ).toMatchObject({
      id: 'photo:photo-a',
      mediaType: 'image/heic',
      name: 'camera-shot.HEIC',
      uri: 'file://photo-a.heic',
    });
  });

  test('creates pasted image attachments from local file URIs', () => {
    expect(createPastedImageAttachmentDraft('file:///tmp/Pasted%20Sticker.GIF')).toMatchObject({
      id: 'photo:file:///tmp/Pasted%20Sticker.GIF',
      kind: 'image',
      mediaType: 'image/gif',
      name: 'Pasted Sticker.GIF',
      uri: 'file:///tmp/Pasted%20Sticker.GIF',
    });
  });

  test('creates camera attachments from expo-camera URIs', () => {
    expect(createCameraAttachmentDraft({ uri: 'file://camera-shot.jpg' })).toMatchObject({
      id: 'photo:file://camera-shot.jpg',
      mediaType: 'image/jpeg',
      uri: 'file://camera-shot.jpg',
    });
    expect(createCameraAttachmentDraft({ uri: '/tmp/camera-shot.jpg' }).uri).toBe(
      'file:///tmp/camera-shot.jpg',
    );
  });

  test('classifies image documents by filename when media type is missing', () => {
    expect(
      createDocumentAttachmentDraft({
        lastModified: 0,
        name: 'photo.webp',
        uri: 'file://photo.webp',
      }),
    ).toMatchObject({ kind: 'image', mediaType: 'image/webp' });
  });

  test('allows only model-supported image attachment formats', () => {
    expect(
      isComposerAttachmentSupported(
        createPhotoAttachmentDraft({ fileName: 'photo.jpg', id: 'jpg', uri: 'file://photo.jpg' }),
      ),
    ).toBe(true);
    expect(
      isComposerAttachmentSupported(
        createDocumentAttachmentDraft({
          lastModified: 0,
          mimeType: 'image/heic',
          name: 'photo.heic',
          uri: 'file://photo.heic',
        }),
      ),
    ).toBe(false);
  });

  test('classifies non-image documents as file attachments', () => {
    expect(
      createDocumentAttachmentDraft({
        lastModified: 0,
        mimeType: 'application/pdf',
        name: 'brief.pdf',
        uri: 'file://brief.pdf',
      }),
    ).toMatchObject({ kind: 'file', mediaType: 'application/pdf' });
  });

  test('detects image media types and file names', () => {
    expect(isComposerImageMediaType('image/jpeg')).toBe(true);
    expect(isComposerImageMediaType('application/pdf')).toBe(false);
    expect(isComposerImageMediaType(undefined)).toBe(false);
    expect(isComposerImageFileName('photo.HEIC')).toBe(true);
    expect(isComposerImageFileName('brief.pdf')).toBe(false);
    expect(isComposerImageFileName(undefined)).toBe(false);
  });

  test('creates managed message parts with text before file attachments', () => {
    const parts = createComposerMessageParts('  summarize this  ', [readyFileAttachment]);

    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ type: 'text', text: 'summarize this' });
    // An imported attachment persists the entry-id sentinel, never a sandbox path.
    expect(parts[1]).toMatchObject({
      filename: 'file-a.pdf',
      mediaType: 'application/pdf',
      type: 'file',
      url: `cherry://file/${readyFileAttachment.fileEntryId}`,
    });
    expect(readCherryMeta(parts[1])).toEqual({
      fileEntryId: readyFileAttachment.fileEntryId,
    });
  });

  test('creates transient message parts without managed file metadata', () => {
    const parts = createComposerMessageParts('', [transientFileAttachment]);

    expect(parts).toEqual([
      {
        filename: 'file-a.pdf',
        mediaType: 'application/pdf',
        type: 'file',
        url: 'file-a.pdf',
      },
    ]);
  });

  test('recognizes managed lifecycle states', () => {
    const importing = { ...transientFileAttachment, status: 'importing' as const };

    expect(isComposerAttachmentReady(readyFileAttachment)).toBe(true);
    expect(isComposerAttachmentReady(importing)).toBe(false);
    expect(hasImportingComposerAttachments([readyFileAttachment, importing])).toBe(true);
    expect(hasImportingComposerAttachments([readyFileAttachment])).toBe(false);
  });

  test('detects sendable text or attachment content', () => {
    expect(hasComposerSendableContent('  hi  ', [])).toBe(true);
    expect(hasComposerSendableContent('   ', [transientFileAttachment])).toBe(true);
    expect(hasComposerSendableContent('   ', [])).toBe(false);
  });
});
