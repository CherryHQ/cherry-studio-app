/**
 * `Message` -> AI SDK `UIMessage`, with unresolved `file://` URLs dropped
 * until the mobile file resolver is wired to Expo FileSystem.
 */

import type { UIMessage } from 'ai';
import type { CherryMessagePart, CherryUIMessage, Message } from '@/data/types/message';

import { resolveFileUIPart } from './fileProcessor';

export function toCherryUIMessage(message: Message): CherryUIMessage {
  const parts: CherryMessagePart[] = message.data?.parts ?? [];
  return {
    id: message.id,
    role: message.role,
    parts,
  } as CherryUIMessage;
}

/** Unresolvable file parts are dropped with a warning. */
async function resolveMessageParts<T extends UIMessage>(
  message: T,
  options?: { extractPdf?: boolean },
): Promise<T> {
  if (!message.parts?.length) return message;

  const resolved: UIMessage['parts'] = [];
  for (const part of message.parts) {
    if (part.type === 'file') {
      const next = await resolveFileUIPart(part, options);
      if (next) resolved.push(next as UIMessage['parts'][number]);
      continue;
    }
    resolved.push(part as UIMessage['parts'][number]);
  }

  return { ...message, parts: resolved } as T;
}

/** Idempotent for non-file parts and non-`file://` URLs. */
export async function resolveUIMessageFileUrls<T extends UIMessage = UIMessage>(
  messages: T[],
  options?: { extractPdf?: boolean },
): Promise<T[]> {
  return Promise.all(messages.map((m) => resolveMessageParts(m, options)));
}
