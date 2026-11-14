import type { Model, Api } from '@earendil-works/pi-ai';

import { uploadDeepseekDocument } from '@/backend/services/file/deepseekFiles';
import {
  createDeepseekConnection,
  getDeepseekServices,
} from '@/backend/services/providers/deepseekConnection';

import type { PiStreamFn } from './piModelTypes';
import { PiProviderDocumentSchema, type PiProviderDocument } from './piProviderDocument';

/** The actual serving key is bound per attempt, including Pi's credential failover. */
export function withPiDeepseekFiles(
  stream: PiStreamFn,
  providerId: string,
  apiKey: string,
): PiStreamFn {
  return async (model, context, options) => {
    const config = getDeepseekServices();
    // Disabling uploads must not lock a conversation whose history still contains references.
    if (!config.files || config.providerId !== providerId || model.id !== 'deepseek-flash')
      return stream(model, context, options);
    const documents = context.messages.flatMap((message) =>
      message.role === 'user' && Array.isArray(message.content)
        ? message.content.flatMap((part) => {
            if (part.type !== 'text') return [];
            const metadata = PiProviderDocumentSchema.safeParse(
              (part as PiProviderDocument).cherryProviderDocument,
            );
            return metadata.success ? [{ marker: part.text, ...metadata.data }] : [];
          })
        : [],
    );
    if (!documents.length) return stream(model, context, options);
    const onPayload = options?.onPayload;
    return stream(model, context, {
      ...options,
      onPayload: async (payload, wire) => {
        const sent = (await onPayload?.(payload, wire)) ?? payload;
        const signal = options?.signal ?? new AbortController().signal;
        const connection = createDeepseekConnection(config, apiKey);
        const references = new Map<string, string>();
        const unique = new Map(documents.map((document) => [document.fileEntryId, document]));
        if (documents.length > 20)
          throw new Error('DeepSeek accepts at most 20 document references.');
        for (const document of documents) {
          if (document.revision !== unique.get(document.fileEntryId)?.revision)
            throw new Error(
              'The document changed after it was attached. Attach its current version again.',
            );
        }
        for (const [id, document] of unique) {
          signal.throwIfAborted();
          references.set(id, await uploadDeepseekDocument(connection, document, signal));
        }
        return applyFiles(
          sent,
          wire,
          documents.map((document) => ({
            marker: document.marker,
            id: references.get(document.fileEntryId)!,
          })),
        );
      },
    });
  };
}

function applyFiles(
  payload: unknown,
  model: Model<Api>,
  documents: { marker: string; id: string }[],
): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const body = payload as Record<string, unknown>;
  const responses = model.api === 'openai-responses';
  const key = responses ? 'input' : 'messages';
  if (!Array.isArray(body[key])) return payload;
  const textType = responses ? 'input_text' : 'text';
  let references = 0;
  const expand = (text: string): Record<string, unknown>[] => {
    let parts: Record<string, unknown>[] = [{ type: textType, text }];
    for (const document of new Map(
      documents.map((document) => [document.marker, document]),
    ).values()) {
      parts = parts.flatMap((part) => {
        if (
          part.type !== textType ||
          typeof part.text !== 'string' ||
          !part.text.includes(document.marker)
        )
          return [part];
        const segments = part.text.split(document.marker);
        references += segments.length - 1;
        if (references > 20) throw new Error('DeepSeek accepts at most 20 document references.');
        return segments.flatMap<Record<string, unknown>>((text, index) => [
          ...(index
            ? [
                model.api === 'anthropic-messages'
                  ? { type: 'document', source: { type: 'file', file_id: document.id } }
                  : { type: responses ? 'input_file' : 'file', file_id: document.id },
                // Keep the Host's name, managed ID and trust label beside the native document.
                { type: textType, text: document.marker },
              ]
            : []),
          ...(text ? [{ type: textType, text }] : []),
        ]);
      });
    }
    return parts;
  };
  return {
    ...body,
    [key]: body[key].map((value: unknown) => {
      if (!value || typeof value !== 'object') return value;
      const message = value as Record<string, unknown>;
      if (message.role !== 'user') return value;
      const content =
        typeof message.content === 'string'
          ? expand(message.content)
          : Array.isArray(message.content)
            ? message.content.flatMap((value) => {
                if (!value || typeof value !== 'object') return [value];
                const part = value as Record<string, unknown>;
                return part.type === textType && typeof part.text === 'string'
                  ? expand(part.text)
                  : [part];
              })
            : message.content;
      return { ...message, content };
    }),
  };
}
