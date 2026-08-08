import { readCherryMeta } from '@cherrystudio/universal/data/types/uiParts';

import {
  appendChatInputAttachments,
  type ChatInputAttachmentDraft,
  type ChatInputAttachmentReady,
  type ChatInputAttachmentSource,
  createCameraAttachmentDraft,
  createChatInputMessageParts,
  createDocumentAttachmentDraft,
  createPastedImageAttachmentDraft,
  createPhotoAttachmentDraft,
  hasChatInputSendableContent,
  hasImportingChatInputAttachments,
  isChatInputImageFileName,
  isChatInputImageMediaType,
  removeChatInputAttachment,
} from '../chatInputAttachments';

const fileAttachment: ChatInputAttachmentReady = {
  fileEntryId: '00000000-0000-7000-8000-000000000001',
  id: 'file:file-a.pdf',
  kind: 'file',
  mediaType: 'application/pdf',
  name: 'file-a.pdf',
  status: 'ready',
  uri: 'file-a.pdf',
};

function asImporting(source: ChatInputAttachmentSource): ChatInputAttachmentDraft {
  return { ...source, status: 'importing' };
}

describe('chat input attachments', () => {
  test('appends attachments while preserving existing items and dropping duplicates', () => {
    const imageAttachment = createPhotoAttachmentDraft({ id: 'photo-a', uri: 'photo-a.jpg' });
    const importingImage = asImporting(imageAttachment);

    expect(appendChatInputAttachments([importingImage], [fileAttachment, importingImage])).toEqual([
      importingImage,
      fileAttachment,
    ]);
  });

  test('removes an attachment by id', () => {
    const imageAttachment = createPhotoAttachmentDraft({ id: 'photo-a', uri: 'photo-a.jpg' });

    expect(
      removeChatInputAttachment([asImporting(imageAttachment), fileAttachment], imageAttachment.id),
    ).toEqual([fileAttachment]);
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
    ).toMatchObject({
      kind: 'image',
      mediaType: 'image/*',
    });
  });

  test('classifies non-image documents as file attachments', () => {
    expect(
      createDocumentAttachmentDraft({
        lastModified: 0,
        mimeType: 'application/pdf',
        name: 'brief.pdf',
        uri: 'file://brief.pdf',
      }),
    ).toMatchObject({
      kind: 'file',
      mediaType: 'application/pdf',
    });
  });

  test('detects image media types', () => {
    expect(isChatInputImageMediaType('image/jpeg')).toBe(true);
    expect(isChatInputImageMediaType('application/pdf')).toBe(false);
    expect(isChatInputImageMediaType(undefined)).toBe(false);
  });

  test('detects image file names', () => {
    expect(isChatInputImageFileName('photo.HEIC')).toBe(true);
    expect(isChatInputImageFileName('brief.pdf')).toBe(false);
    expect(isChatInputImageFileName(undefined)).toBe(false);
  });

  test('creates message parts with text before file attachments', () => {
    expect(createChatInputMessageParts('  summarize this  ', [fileAttachment])).toEqual([
      { type: 'text', text: 'summarize this' },
      {
        filename: 'file-a.pdf',
        mediaType: 'application/pdf',
        providerMetadata: {
          cherry: { fileEntryId: '00000000-0000-7000-8000-000000000001' },
        },
        type: 'file',
        url: 'file-a.pdf',
      },
    ]);
  });

  test('creates file-only message parts', () => {
    expect(createChatInputMessageParts('   ', [fileAttachment])).toEqual([
      {
        filename: 'file-a.pdf',
        mediaType: 'application/pdf',
        providerMetadata: {
          cherry: { fileEntryId: '00000000-0000-7000-8000-000000000001' },
        },
        type: 'file',
        url: 'file-a.pdf',
      },
    ]);
  });

  test('preserves a managed file entry id in message part metadata', () => {
    const parts = createChatInputMessageParts('', [fileAttachment]);
    const part = parts[0];

    expect(part.type).toBe('file');
    if (part.type !== 'file') {
      throw new Error('Expected a file part');
    }
    expect(readCherryMeta(part)).toEqual({
      fileEntryId: '00000000-0000-7000-8000-000000000001',
    });
  });

  test('detects sendable text or attachment content', () => {
    expect(hasChatInputSendableContent('  hi  ', [])).toBe(true);
    expect(hasChatInputSendableContent('   ', [fileAttachment])).toBe(true);
    expect(hasChatInputSendableContent('   ', [])).toBe(false);
  });

  test('detects attachments that are still importing', () => {
    const source = createPhotoAttachmentDraft({ id: 'photo-a', uri: 'photo-a.jpg' });

    expect(hasImportingChatInputAttachments([asImporting(source), fileAttachment])).toBe(true);
    expect(hasImportingChatInputAttachments([fileAttachment])).toBe(false);
  });
});
