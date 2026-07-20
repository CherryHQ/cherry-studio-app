/** `Message` -> AI SDK `UIMessage`. */

import type { UIMessage } from 'ai';

import type { CherryMessagePart, CherryUIMessage, Message } from '@/data/types/message';

import { prepareChatMessages } from './attachmentRouting';
import type { MediaCapabilities } from './messageCapabilities';

export function toCherryUIMessage(message: Message): CherryUIMessage {
  const parts: CherryMessagePart[] = message.data?.parts ?? [];
  return {
    id: message.id,
    role: message.role,
    parts,
  } as CherryUIMessage;
}

/**
 * Resolve file URLs in messages: native files are inlined as base64 data URLs,
 * non-native PDFs have text extracted. Delegates to `attachmentRouting` which
 * carries the per-provider native-support logic.
 */
export async function resolveUIMessageFileUrls<T extends UIMessage = UIMessage>(
  messages: T[],
  nativeSupport: MediaCapabilities,
): Promise<T[]> {
  return prepareChatMessages(messages, nativeSupport);
}
