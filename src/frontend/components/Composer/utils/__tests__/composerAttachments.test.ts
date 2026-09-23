import { readCherryMeta } from '@/shared/data/types/uiParts';

import {
  appendComposerAttachments,
  type ComposerAttachmentReady,
  type ComposerAttachmentSource,
  createCameraAttachmentDraft,
  createComposerMessageParts,
  createDocumentAttachmentDraft,
  createDroppedImageAttachmentDraft,
  createPastedImageAttachmentDraft,
  createPhotoAttachmentDraft,
  hasComposerSendableContent,
  hasImportingComposerAttachments,
  isComposerAttachmentReady,
  isComposerImageFileName,
  isComposerImageMediaType,
  isDroppedImagePayload,
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

  test('deduplicates library references within a batch without dropping distinct files', () => {
    const libraryAttachment = {
      ...readyFileAttachment,
      id: `file-entry:${readyFileAttachment.fileEntryId}`,
    };
    const otherFile: ComposerAttachmentReady = {
      ...readyFileAttachment,
      id: 'file:other',
      fileEntryId: '00000000-0000-7000-8000-000000000002',
    };

    expect(
      appendComposerAttachments([], [libraryAttachment, readyFileAttachment, otherFile]),
    ).toEqual([libraryAttachment, otherFile]);
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
        mediaType: 'image/png',
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

  test('creates dropped image attachments from the native drop payload', () => {
    expect(
      createDroppedImageAttachmentDraft({
        height: 800,
        id: 'drop-a',
        mediaType: 'image/heic',
        name: 'IMG_0001.HEIC',
        size: 2048,
        uri: 'file:///cache/ImageDropTarget/IMG_0001.HEIC',
        width: 600,
      }),
    ).toEqual({
      id: 'photo:drop-a',
      kind: 'image',
      mediaType: 'image/heic',
      name: 'IMG_0001.HEIC',
      size: 2048,
      uri: 'file:///cache/ImageDropTarget/IMG_0001.HEIC',
    });
  });

  test('falls back to the file-name media type when the drop payload has none', () => {
    expect(
      createDroppedImageAttachmentDraft({
        id: 'drop-2',
        name: 'shot.png',
        uri: 'file:///cache/ImageDropTarget/shot.png',
      }),
    ).toMatchObject({ kind: 'image', mediaType: 'image/png', name: 'shot.png' });
  });

  test('accepts only image payloads for drop staging', () => {
    expect(
      isDroppedImagePayload({
        id: 'drop-img',
        mediaType: 'image/jpeg',
        name: 'photo.jpg',
        uri: 'file:///cache/photo.jpg',
      }),
    ).toBe(true);
    expect(
      isDroppedImagePayload({ id: 'drop-4', mediaType: undefined, name: 'photo.HEIC', uri: 'x' }),
    ).toBe(true);
    expect(
      isDroppedImagePayload({
        id: 'drop-5',
        mediaType: 'application/pdf',
        name: 'brief.pdf',
        uri: 'file:///cache/brief.pdf',
      }),
    ).toBe(false);
    expect(
      isDroppedImagePayload({ id: 'drop-6', mediaType: 'text/plain', name: undefined, uri: 'x' }),
    ).toBe(false);
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
        name: 'photo.webp',
        uri: 'file://photo.webp',
      }),
    ).toMatchObject({ kind: 'image', mediaType: 'image/webp' });
  });

  test('classifies non-image documents as file attachments', () => {
    expect(
      createDocumentAttachmentDraft({
        mediaType: 'application/pdf',
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
