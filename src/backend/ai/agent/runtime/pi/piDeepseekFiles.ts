import type { Model, Api } from '@earendil-works/pi-ai';

import {
  DeepseekDocumentUnavailableError,
  uploadDeepseekDocument,
} from '@/backend/services/file/deepseekFiles';
import { createDeepseekConnection } from '@/backend/services/providers/deepseekConnection';

import type { PiStreamFn } from './piModelTypes';
import { PiProviderDocumentSchema, type PiProviderDocument } from './piProviderDocument';

type PreparedDocument = NonNullable<PiProviderDocument['cherryProviderDocument']> & {
  placeholder: string;
  text: string;
  isCurrent: boolean;
};

type WireDocument = { text: string; fileId?: string };

const MAX_DOCUMENT_REFERENCES = 20;

/** The actual serving key is bound per attempt, including Pi's credential failover. */
export function withPiDeepseekFiles(
  stream: PiStreamFn,
  providerId: string,
  apiKey: string,
  baseUrl: string,
): PiStreamFn {
  return async (model, context, options) => {
    const current = context.messages.findLast((message) => message.role === 'user');
    const documents: PreparedDocument[] = [];
    let nonce: string | undefined;
    const messages = context.messages.map((message) => {
      if (message.role !== 'user' || !Array.isArray(message.content)) return message;
      const content = message.content.map((part) => {
        if (part.type !== 'text') return part;
        const metadata = PiProviderDocumentSchema.safeParse(
          (part as PiProviderDocument).cherryProviderDocument,
        );
        if (!metadata.success) return part;
        nonce ??= globalThis.crypto.randomUUID();
        // A request-only marker identifies this occurrence, even when two revisions share text.
        const placeholder = `[[cherry-document:${nonce}:${documents.length}]]`;
        documents.push({
          ...metadata.data,
          placeholder,
          text: part.text,
          isCurrent: message === current,
        });
        return { ...part, text: placeholder };
      });
      return { ...message, content };
    });
    if (nonce === undefined) return stream(model, context, options);
    const requestNonce = nonce;
    const onPayload = options?.onPayload;
    return stream(
      model,
      { ...context, messages },
      {
        ...options,
        onPayload: async (payload, wire) => {
          const sent = (await onPayload?.(payload, wire)) ?? payload;
          const signal = options?.signal ?? new AbortController().signal;
          const connection = createDeepseekConnection(providerId, baseUrl, apiKey);
          const references = new Map<string, string | null>();
          const wireDocuments = new Map<string, WireDocument>();
          let referenceCount = 0;
          // Newest documents keep native input; older ones stay readable through read_file, so
          // a long conversation never exceeds the reference limit.
          for (const document of documents.toReversed()) {
            signal.throwIfAborted();
            if (referenceCount >= MAX_DOCUMENT_REFERENCES && !document.isCurrent) {
              wireDocuments.set(document.placeholder, {
                text: `Earlier document ${document.fileEntryId} is not attached natively to this request. Use read_file with this file_entry_id if its content is needed.`,
              });
              continue;
            }
            const key = JSON.stringify([
              document.fileEntryId,
              document.revision,
              document.mediaType,
            ]);
            let fileId = references.get(key);
            if (fileId === undefined) {
              try {
                fileId = await uploadDeepseekDocument(connection, document, signal);
              } catch (error) {
                signal.throwIfAborted();
                if (!(error instanceof DeepseekDocumentUnavailableError)) throw error;
                fileId = null;
              }
              references.set(key, fileId);
            }
            if (fileId === null) {
              if (document.isCurrent) throw new DeepseekDocumentUnavailableError();
              wireDocuments.set(document.placeholder, {
                text: `Historical document ${document.fileEntryId} is no longer available in its attached version. Ask the user to attach it again if needed.`,
              });
            } else {
              if (++referenceCount > MAX_DOCUMENT_REFERENCES)
                throw new Error(
                  `DeepSeek accepts at most ${MAX_DOCUMENT_REFERENCES} document references.`,
                );
              wireDocuments.set(document.placeholder, { text: document.text, fileId });
            }
          }
          return applyFiles(sent, wire, wireDocuments, requestNonce);
        },
      },
    );
  };
}

function applyFiles(
  payload: unknown,
  model: Model<Api>,
  documents: ReadonlyMap<string, WireDocument>,
  nonce: string,
): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const body = payload as Record<string, unknown>;
  const responses = model.api === 'openai-responses';
  const key = responses ? 'input' : 'messages';
  if (!Array.isArray(body[key])) return payload;
  const textType = responses ? 'input_text' : 'text';
  const placeholders = new RegExp(`(\\[\\[cherry-document:${nonce}:\\d+\\]\\])`);
  const expand = (part: Record<string, unknown>, text: string) => {
    const segments = text.split(placeholders);
    if (segments.length === 1) return undefined;
    return segments.flatMap<Record<string, unknown>>((segment) => {
      if (!segment) return [];
      const document = documents.get(segment);
      if (!document?.fileId) return [{ ...part, text: document?.text ?? segment }];
      const file =
        model.api === 'anthropic-messages'
          ? { type: 'document', source: { type: 'file', file_id: document.fileId } }
          : { type: responses ? 'input_file' : 'file', file_id: document.fileId };
      return [file, { ...part, text: document.text }];
    });
  };
  return {
    ...body,
    [key]: body[key].map((value: unknown) => {
      if (!value || typeof value !== 'object') return value;
      const message = value as Record<string, unknown>;
      if (message.role !== 'user') return value;
      const content =
        typeof message.content === 'string'
          ? (expand({ type: textType }, message.content) ?? message.content)
          : Array.isArray(message.content)
            ? message.content.flatMap((value) => {
                if (!value || typeof value !== 'object') return [value];
                const part = value as Record<string, unknown>;
                return part.type === textType && typeof part.text === 'string'
                  ? (expand(part, part.text) ?? [part])
                  : [part];
              })
            : message.content;
      return { ...message, content };
    }),
  };
}
