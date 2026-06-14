import {
  appendChatInputAttachments,
  type ChatInputAttachmentDraft,
  createChatInputMessageParts,
  createDocumentAttachmentDraft,
  createPhotoAttachmentDraft,
  getChatInputFileExtension,
  hasChatInputSendableContent,
  isChatInputImageFileName,
  isChatInputImageMediaType,
  removeChatInputAttachment,
} from '../chatInputAttachments';

const fileAttachment: ChatInputAttachmentDraft = {
  id: 'file:file-a.pdf',
  kind: 'file',
  mediaType: 'application/pdf',
  name: 'file-a.pdf',
  uri: 'file-a.pdf',
};

describe('chat input attachments', () => {
  test('appends attachments while preserving existing items and dropping duplicates', () => {
    const imageAttachment = createPhotoAttachmentDraft({ id: 'photo-a', uri: 'photo-a.jpg' });

    expect(
      appendChatInputAttachments([imageAttachment], [fileAttachment, imageAttachment]),
    ).toEqual([imageAttachment, fileAttachment]);
  });

  test('removes an attachment by id', () => {
    const imageAttachment = createPhotoAttachmentDraft({ id: 'photo-a', uri: 'photo-a.jpg' });

    expect(
      removeChatInputAttachment([imageAttachment, fileAttachment], imageAttachment.id),
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

  test('extracts compact file extensions', () => {
    expect(getChatInputFileExtension('report.pdf')).toBe('PDF');
    expect(getChatInputFileExtension('archive.longextension')).toBe('LONGE');
    expect(getChatInputFileExtension('README')).toBe('');
  });

  test('creates message parts with text before file attachments', () => {
    expect(createChatInputMessageParts('  summarize this  ', [fileAttachment])).toEqual([
      { type: 'text', text: 'summarize this' },
      {
        filename: 'file-a.pdf',
        mediaType: 'application/pdf',
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
        type: 'file',
        url: 'file-a.pdf',
      },
    ]);
  });

  test('detects sendable text or attachment content', () => {
    expect(hasChatInputSendableContent('  hi  ', [])).toBe(true);
    expect(hasChatInputSendableContent('   ', [fileAttachment])).toBe(true);
    expect(hasChatInputSendableContent('   ', [])).toBe(false);
  });
});
