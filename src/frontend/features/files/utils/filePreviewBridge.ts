import {
  FILE_PREVIEW_CHUNK_BYTES,
  type FilePreviewErrorCode,
  type HostMessage,
  type PageMessage,
  type PdfResourceIndex,
  pdfResourceKey,
} from '@cherrystudio/file-preview-webview/protocol';
import { File, type FileHandle, FileMode } from 'expo-file-system';

import { loggerService } from '@/shared/core/logger/LoggerService';

const logger = loggerService.withContext('FilePreviewBridge');

export interface FilePreviewBridgeOptions {
  fileUri: string;
  /** Opaque document version; the entry's `updatedAt`. */
  revision: string;
  pdfResources: { uri: string; index: PdfResourceIndex };
  send: (message: HostMessage) => void;
  openFile?: (uri: string) => FileHandle;
  yieldToEventLoop?: () => Promise<void>;
}

type BridgeRequest = Extract<
  PageMessage,
  { type: 'open' | 'read' | 'resource' | 'cancel' | 'close' }
>;

interface OpenDocument {
  handle: FileHandle;
  size: number;
}

class BridgeReadError extends Error {
  constructor(
    readonly code: FilePreviewErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function openReadOnly(uri: string): FileHandle {
  return new File(uri).open(FileMode.ReadOnly);
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

/**
 * The app half of the preview byte bridge. Each page `open` holds its own read-only handle, so
 * a document's size stays fixed; reads stream exact ranges as base64 chunks and fail on short
 * reads, size changes, cancellation or a closed document.
 */
export class FilePreviewBridge {
  private readonly documents = new Map<number, OpenDocument>();
  private readonly activeRequests = new Set<number>();
  private nextDocumentId = 0;
  private resourceHandle: FileHandle | null = null;
  private isDisposed = false;
  private readonly openFile: (uri: string) => FileHandle;
  private readonly yieldToEventLoop: () => Promise<void>;

  constructor(private readonly options: FilePreviewBridgeOptions) {
    this.openFile = options.openFile ?? openReadOnly;
    this.yieldToEventLoop = options.yieldToEventLoop ?? nextTask;
  }

  handle(message: BridgeRequest): void {
    if (this.isDisposed) return;
    switch (message.type) {
      case 'open':
        this.open(message.requestId);
        return;
      case 'read':
        void this.read(message.requestId, message.documentId, message.offset, message.length);
        return;
      case 'resource':
        void this.readResource(message.requestId, message.kind, message.name);
        return;
      case 'cancel':
        this.activeRequests.delete(message.requestId);
        return;
      case 'close':
        this.close(message.documentId);
    }
  }

  dispose(): void {
    this.isDisposed = true;
    this.activeRequests.clear();
    for (const documentId of [...this.documents.keys()]) this.close(documentId);
    closeQuietly(this.resourceHandle);
    this.resourceHandle = null;
  }

  private open(requestId: number): void {
    try {
      const handle = this.openFile(this.options.fileUri);
      const size = handle.size;
      if (size === null) {
        closeQuietly(handle);
        throw new Error('File size is unavailable');
      }
      const documentId = this.nextDocumentId++;
      this.documents.set(documentId, { handle, size });
      this.options.send({
        type: 'opened',
        requestId,
        documentId,
        size,
        revision: this.options.revision,
      });
    } catch (error) {
      logger.warn('Failed to open preview document', error as Error);
      this.fail(requestId, 'load_error', 'Failed to open the file');
    }
  }

  private close(documentId: number): void {
    const document = this.documents.get(documentId);
    if (!document) return;
    this.documents.delete(documentId);
    closeQuietly(document.handle);
  }

  private async read(requestId: number, documentId: number, offset: number, length: number) {
    const document = this.documents.get(documentId);
    if (!document) {
      this.fail(requestId, 'closed', 'Preview document is closed');
      return;
    }
    if (offset + length > document.size) {
      this.fail(requestId, 'invalid_range', `Invalid range ${offset} + ${length}`);
      return;
    }
    const startedAt = Date.now();
    const isDelivered = await this.stream(requestId, offset, length, () => {
      if (this.documents.get(documentId) !== document) {
        throw new BridgeReadError('closed', 'Preview document is closed');
      }
      if (document.handle.size !== document.size) {
        throw new BridgeReadError('source_changed', 'The file changed while it was being read');
      }
      return document.handle;
    });
    // One line per whole-document read (DOCX, PPTX, XLSX, images); PDF ranges stay quiet.
    if (isDelivered && offset === 0 && length === document.size) {
      logger.info('Preview document delivered', {
        bytes: length,
        durationMs: Date.now() - startedAt,
      });
    }
  }

  private async readResource(requestId: number, kind: 'cmap' | 'standard_font', name: string) {
    const range = this.options.pdfResources.index[pdfResourceKey(kind, name)];
    if (!range) {
      this.fail(requestId, 'load_error', `Unknown PDF resource ${kind}/${name}`);
      return;
    }
    await this.stream(requestId, range[0], range[1], () => {
      this.resourceHandle ??= this.openFile(this.options.pdfResources.uri);
      return this.resourceHandle;
    });
  }

  private async stream(
    requestId: number,
    offset: number,
    length: number,
    acquire: () => FileHandle,
  ): Promise<boolean> {
    this.activeRequests.add(requestId);
    try {
      let position = offset;
      const end = offset + length;
      while (position < end) {
        // A cancelled or disposed request stops quietly: the page already rejected it.
        if (!this.activeRequests.has(requestId)) return false;
        const handle = acquire();
        const count = Math.min(FILE_PREVIEW_CHUNK_BYTES, end - position);
        handle.offset = position;
        const bytes = handle.readBytes(count);
        if (bytes.byteLength !== count) {
          throw new BridgeReadError(
            'short_read',
            `Short read at ${position}: expected ${count} bytes, received ${bytes.byteLength}`,
          );
        }
        this.options.send({ type: 'chunk', requestId, data: encodeBase64(bytes) });
        position += count;
        if (position < end) await this.yieldToEventLoop();
      }
      if (!this.activeRequests.has(requestId)) return false;
      this.options.send({ type: 'done', requestId });
      return true;
    } catch (error) {
      if (!this.activeRequests.has(requestId)) return false;
      if (error instanceof BridgeReadError) {
        this.fail(requestId, error.code, error.message);
      } else {
        logger.warn('Preview read failed', error as Error);
        this.fail(requestId, 'load_error', 'Failed to read the file');
      }
      return false;
    } finally {
      this.activeRequests.delete(requestId);
    }
  }

  private fail(requestId: number, code: FilePreviewErrorCode, message: string): void {
    this.options.send({ type: 'failed', requestId, code, message });
  }
}

function closeQuietly(handle: FileHandle | null): void {
  try {
    handle?.close();
  } catch {
    // Closing an already-released handle is not an error for the preview.
  }
}
