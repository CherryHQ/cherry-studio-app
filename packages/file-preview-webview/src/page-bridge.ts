import { type PreviewDocument, PreviewError } from '@cherrystudio/file-preview/core';

import type { HostMessage, PageMessage, PdfResourceKind } from './protocol';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

interface PendingOpen {
  kind: 'open';
  resolve: (opened: Extract<HostMessage, { type: 'opened' }>) => void;
  reject: (error: unknown) => void;
}

interface PendingBytes {
  kind: 'bytes';
  documentId?: number;
  bytes: Uint8Array<ArrayBuffer> | null;
  chunks: Uint8Array<ArrayBuffer>[];
  received: number;
  resolve: (bytes: Uint8Array<ArrayBuffer>) => void;
  reject: (error: unknown) => void;
}

type Pending = PendingOpen | PendingBytes;

export function post(message: PageMessage): void {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

function decodeBase64Into(target: Uint8Array, offset: number, data: string): number {
  const binary = atob(data);
  if (offset + binary.length > target.length) return -1;
  for (let index = 0; index < binary.length; index++) {
    target[offset + index] = binary.charCodeAt(index);
  }
  return binary.length;
}

function decodeBase64(data: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(atob(data).length);
  decodeBase64Into(bytes, 0, data);
  return bytes;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Aborted', 'AbortError');
}

/** The page half of the byte bridge: every read is a request answered by injected chunks. */
export class PageBridge {
  private nextRequestId = 0;
  private readonly pending = new Map<number, Pending>();

  receive(message: Exclude<HostMessage, { type: 'render' }>): void {
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    switch (message.type) {
      case 'opened':
        if (pending.kind !== 'open') return;
        this.pending.delete(message.requestId);
        pending.resolve(message);
        return;
      case 'chunk':
        if (pending.kind !== 'bytes') return;
        if (pending.bytes) {
          const written = decodeBase64Into(pending.bytes, pending.received, message.data);
          if (written < 0) {
            this.fail(
              message.requestId,
              new PreviewError('load_error', 'Preview bridge sent excess bytes'),
            );
            return;
          }
          pending.received += written;
        } else {
          const chunk = decodeBase64(message.data);
          pending.chunks.push(chunk);
          pending.received += chunk.length;
        }
        return;
      case 'done':
        if (pending.kind !== 'bytes') return;
        this.pending.delete(message.requestId);
        if (pending.bytes) {
          if (pending.received !== pending.bytes.length) {
            pending.reject(
              new PreviewError(
                'short_read',
                `Short preview read: expected ${pending.bytes.length} bytes, received ${pending.received}`,
              ),
            );
          } else {
            pending.resolve(pending.bytes);
          }
        } else {
          const joined = new Uint8Array(pending.received);
          let offset = 0;
          for (const chunk of pending.chunks) {
            joined.set(chunk, offset);
            offset += chunk.length;
          }
          pending.resolve(joined);
        }
        return;
      case 'failed':
        this.fail(message.requestId, new PreviewError(message.code, message.message));
    }
  }

  async open(signal?: AbortSignal): Promise<PreviewDocument> {
    signal?.throwIfAborted();
    const requestId = this.nextRequestId++;
    const opened = await new Promise<Extract<HostMessage, { type: 'opened' }>>(
      (resolve, reject) => {
        this.pending.set(requestId, { kind: 'open', resolve, reject });
        post({ type: 'open', requestId });
      },
    );
    let isClosed = false;
    const close = async () => {
      if (isClosed) return;
      isClosed = true;
      for (const [id, pending] of this.pending) {
        if (pending.kind === 'bytes' && pending.documentId === opened.documentId) {
          this.cancel(id, new PreviewError('closed', 'Preview document is closed'));
        }
      }
      post({ type: 'close', documentId: opened.documentId });
    };
    if (signal?.aborted) {
      await close();
      throw abortReason(signal);
    }
    return {
      size: opened.size,
      revision: opened.revision,
      readRange: (offset, length, readSignal) => {
        if (isClosed)
          return Promise.reject(new PreviewError('closed', 'Preview document is closed'));
        return this.requestBytes(
          (id) => ({ type: 'read', requestId: id, documentId: opened.documentId, offset, length }),
          readSignal,
          opened.documentId,
          length,
        );
      },
      close,
    };
  }

  readPdfResource(kind: PdfResourceKind, name: string): Promise<Uint8Array> {
    return this.requestBytes((requestId) => ({ type: 'resource', requestId, kind, name }));
  }

  private requestBytes(
    message: (requestId: number) => PageMessage,
    signal?: AbortSignal,
    documentId?: number,
    length?: number,
  ): Promise<Uint8Array<ArrayBuffer>> {
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    const requestId = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const onAbort = () => this.cancel(requestId, abortReason(signal!));
      signal?.addEventListener('abort', onAbort, { once: true });
      const settle =
        <T>(callback: (value: T) => void) =>
        (value: T) => {
          signal?.removeEventListener('abort', onAbort);
          callback(value);
        };
      this.pending.set(requestId, {
        kind: 'bytes',
        documentId,
        // Whole-file reads arrive as tens of chunks; filling one buffer avoids a second copy.
        bytes: length === undefined ? null : new Uint8Array(length),
        chunks: [],
        received: 0,
        resolve: settle(resolve),
        reject: settle(reject),
      });
      post(message(requestId));
    });
  }

  private cancel(requestId: number, reason: unknown): void {
    if (!this.pending.has(requestId)) return;
    post({ type: 'cancel', requestId });
    this.fail(requestId, reason);
  }

  private fail(requestId: number, reason: unknown): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    pending.reject(reason);
  }
}
