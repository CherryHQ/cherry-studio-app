import * as z from 'zod';

import { PluginError } from '@/shared/contracts/plugins';

const HeaderSchema = z.object({ name: z.string().max(256), value: z.string().max(32_768) });
const PartSchema = z.object({
  mimeType: z.string().max(256).optional(),
  filename: z.string().max(2048).optional(),
  headers: z.array(HeaderSchema).max(500).optional(),
  body: z
    .object({
      attachmentId: z.string().max(4096).optional(),
      size: z.number().int().nonnegative().optional(),
      data: z.string().max(3_000_000).optional(),
    })
    .optional(),
  parts: z.array(z.unknown()).max(200).optional(),
});
const MessageSchema = z.object({
  id: z.string().min(1).max(256),
  threadId: z.string().min(1).max(256),
  labelIds: z.array(z.string().max(256)).max(500).optional(),
  snippet: z.string().max(4096).optional(),
  internalDate: z.string().max(32).optional(),
  sizeEstimate: z.number().nonnegative().optional(),
  payload: z.unknown().optional(),
});

function bodyText(part: z.infer<typeof PartSchema>) {
  const data = part.body?.data;
  if (!data) return '';
  if (!/^[a-zA-Z0-9_-]*={0,2}$/.test(data)) throw new Error('Invalid body encoding');
  const contentType = part.headers?.find(
    (header) => header.name.toLowerCase() === 'content-type',
  )?.value;
  const charset = /charset\s*=\s*["']?([^\s;"']+)/i.exec(contentType ?? '')?.[1] ?? 'utf-8';
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return new TextDecoder(charset, { fatal: true }).decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}

/** Decode message text only; file bodies and remote images are never fetched. */
export function readGmailMessage(value: unknown, textLimit = 40_000) {
  const parsed = MessageSchema.safeParse(value);
  if (!parsed.success) throw new PluginError('request', 'Gmail returned an invalid message.');
  const message = parsed.data;
  const attachments: {
    filename: string;
    mimeType?: string;
    attachmentId?: string;
    size?: number;
  }[] = [];
  const text: string[] = [];
  const html: string[] = [];
  const queue = [{ value: message.payload, depth: 0 }];
  let visited = 0;
  let bodyIncomplete = message.payload === undefined;
  let plainIncomplete = false;
  let htmlIncomplete = false;
  let plainLength = 0;
  let htmlLength = 0;
  let headers: z.infer<typeof HeaderSchema>[] = [];
  while (queue.length && visited < 200) {
    const current = queue.shift()!;
    visited++;
    if (current.value === undefined) continue;
    if (current.depth > 20) {
      bodyIncomplete = true;
      continue;
    }
    const part = PartSchema.safeParse(current.value);
    if (!part.success) {
      bodyIncomplete = true;
      continue;
    }
    const data = part.data;
    if (current.depth === 0) headers = data.headers ?? [];
    const disposition = data.headers
      ?.find((header) => header.name.toLowerCase() === 'content-disposition')
      ?.value.split(';')[0]
      .trim()
      .toLowerCase();
    const isAttachment = Boolean(data.filename) || disposition === 'attachment';
    if (isAttachment || data.body?.attachmentId) {
      attachments.push({
        filename: data.filename ?? '',
        mimeType: data.mimeType,
        attachmentId: data.body?.attachmentId,
        size: data.body?.size,
      });
      if (!isAttachment && data.mimeType?.startsWith('text/') && !data.body?.data)
        bodyIncomplete = true;
    }
    // Attached messages can contain their own MIME tree. Keep the entire subtree out of body text.
    if (isAttachment) continue;
    if (data.mimeType === 'text/plain' || data.mimeType === 'text/html') {
      try {
        const decoded = bodyText(data);
        const isPlain = data.mimeType === 'text/plain';
        const length = isPlain ? plainLength : htmlLength;
        const remaining = Math.max(0, textLimit - length);
        (isPlain ? text : html).push(decoded.slice(0, remaining));
        if (decoded.length > remaining) {
          if (isPlain) plainIncomplete = true;
          else htmlIncomplete = true;
        }
        if (isPlain) plainLength += Math.min(decoded.length, remaining);
        else htmlLength += Math.min(decoded.length, remaining);
      } catch {
        bodyIncomplete = true;
      }
    }
    for (const child of data.parts ?? []) queue.push({ value: child, depth: current.depth + 1 });
  }
  if (queue.length) bodyIncomplete = true;
  const hasPlain = text.some(Boolean);
  const joined = (hasPlain ? text : html).join('\n');
  const content = joined.slice(0, textLimit);
  bodyIncomplete ||= (hasPlain ? plainIncomplete : htmlIncomplete) || joined.length > textLimit;
  const wantedHeaders = new Set([
    'from',
    'to',
    'cc',
    'bcc',
    'subject',
    'date',
    'message-id',
    'reply-to',
  ]);
  return {
    id: message.id,
    threadId: message.threadId,
    url: `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(message.id)}`,
    labelIds: message.labelIds ?? [],
    snippet: message.snippet,
    internalDate: message.internalDate,
    sizeEstimate: message.sizeEstimate,
    headers: headers.filter((header) => wantedHeaders.has(header.name.toLowerCase())),
    body: {
      mimeType: hasPlain ? 'text/plain' : html.some(Boolean) ? 'text/html' : null,
      text: content,
      incomplete: bodyIncomplete,
    },
    attachments,
  };
}

export function readGmailThread(value: unknown) {
  const parsed = z
    .object({ id: z.string().max(256), messages: z.array(z.unknown()).max(500).optional() })
    .safeParse(value);
  if (!parsed.success) throw new PluginError('request', 'Gmail returned an invalid thread.');
  let remaining = 60_000;
  const all = parsed.data.messages ?? [];
  const messages = all.slice(0, 100).map((message) => {
    const result = readGmailMessage(message, Math.min(remaining, 20_000));
    remaining = Math.max(0, remaining - result.body.text.length);
    return result;
  });
  return {
    id: parsed.data.id,
    messages,
    messageCount: all.length,
    incomplete: all.length > messages.length || messages.some((message) => message.body.incomplete),
  };
}
