import { readGmailMessage, readGmailThread } from '../gmailMessages';
import { GMAIL_TOOLS } from '../gmailTools';

const encode = (value: string) => Buffer.from(value).toString('base64url');
const message = (payload: unknown) => ({ id: 'abc', threadId: 'def', payload });

it('prefers plain text, decodes Unicode, and leaves attachment bodies unread', () => {
  const result = readGmailMessage(
    message({
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'text/html', body: { data: encode('<b>HTML</b>') } },
        { mimeType: 'text/plain', body: { data: encode('你好 🌸') } },
        {
          mimeType: 'text/plain',
          filename: 'private.txt',
          body: { data: encode('attachment secret'), attachmentId: 'file-id', size: 17 },
        },
      ],
    }),
  );
  expect(result.body).toEqual({ mimeType: 'text/plain', text: '你好 🌸', incomplete: false });
  expect(result.attachments).toEqual([
    { filename: 'private.txt', mimeType: 'text/plain', attachmentId: 'file-id', size: 17 },
  ]);
  expect(JSON.stringify(result)).not.toContain('attachment secret');
});

it('reports missing, malformed and truncated bodies instead of claiming completeness', () => {
  expect(readGmailMessage(message(undefined)).body.incomplete).toBe(true);
  expect(
    readGmailMessage(message({ mimeType: 'text/plain', body: { data: '%%%' } })).body.incomplete,
  ).toBe(true);
  expect(
    readGmailMessage(message({ mimeType: 'text/plain', body: { data: encode('abcdef') } }), 3).body,
  ).toEqual({ mimeType: 'text/plain', text: 'abc', incomplete: true });
  const result = readGmailThread({
    id: 'thread',
    messages: Array.from({ length: 4 }, () =>
      message({ mimeType: 'text/plain', body: { data: encode('x'.repeat(20_000)) } }),
    ),
  });
  expect(result.messages.reduce((length, item) => length + item.body.text.length, 0)).toBe(60_000);
  expect(result.incomplete).toBe(true);
});

it('does not read nested message attachments or unnamed attachment parts as body text', () => {
  const result = readGmailMessage(
    message({
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'text/plain', body: { data: encode('Actual message') } },
        {
          mimeType: 'message/rfc822',
          filename: 'attached.eml',
          parts: [{ mimeType: 'text/plain', body: { data: encode('Nested attachment content') } }],
        },
        {
          mimeType: 'text/plain',
          headers: [{ name: 'Content-Disposition', value: 'Attachment; filename="hidden.txt"' }],
          body: { data: encode('Unnamed attachment content') },
        },
      ],
    }),
  );
  expect(result.body).toEqual({
    mimeType: 'text/plain',
    text: 'Actual message',
    incomplete: false,
  });
  expect(result.attachments).toHaveLength(2);
  expect(JSON.stringify(result)).not.toContain('attachment content');
});

it('keeps user input out of resource paths and rejects write-like arguments', () => {
  const get = GMAIL_TOOLS.get('gmail_get_message')!;
  expect(() => get.request({ messageId: '../profile' })).toThrow();
  expect(() => get.request({ messageId: 'abc', markRead: true })).toThrow();
  expect(get.request({ messageId: 'abc' })).toEqual({
    path: '/gmail/v1/users/me/messages/abc',
    query: { format: 'full' },
  });
  const search = GMAIL_TOOLS.get('gmail_search_messages')!.request({
    query: 'is:unread',
    pageToken: 'cursor',
  });
  expect(search.query).toMatchObject({ q: 'is:unread', pageToken: 'cursor', maxResults: 20 });
});
