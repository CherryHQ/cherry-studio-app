import { randomUUID } from 'expo-crypto';

import type { DocumentExportSession, ExportFormat } from '@/shared/contracts/documentExport';
import type { ResolvedFile } from '@/shared/contracts/file';
import {
  DEFAULT_EXPORT_WATERMARK_STYLE,
  type ExportWatermarkStyle,
} from '@/shared/contracts/fileExport';

type ShareSource =
  | {
      kind: 'document';
      session: DocumentExportSession;
      initialFormat: ExportFormat;
      allowedFormats: readonly ExportFormat[];
    }
  | { kind: 'files'; files: readonly ResolvedFile[]; allowConversion: boolean };
type ShareRequest = ShareSource & {
  id: string;
  watermark: ExportWatermarkStyle;
  resolve(): void;
  timer: ReturnType<typeof setTimeout>;
  operations: Set<Promise<unknown>>;
  cleanups: Set<() => Promise<unknown>>;
};
let active: ShareRequest | undefined;

export function createDocumentShareRequest({
  session,
  initialFormat,
  allowedFormats = ['markdown', 'html', 'image'],
  watermark = DEFAULT_EXPORT_WATERMARK_STYLE,
}: {
  session: DocumentExportSession;
  initialFormat: ExportFormat;
  allowedFormats?: readonly [ExportFormat, ...ExportFormat[]];
  watermark?: ExportWatermarkStyle;
}) {
  return createRequest({
    kind: 'document',
    session,
    initialFormat: allowedFormats.includes(initialFormat) ? initialFormat : allowedFormats[0],
    allowedFormats,
    watermark,
  });
}

export function createFileShareRequest(
  files: readonly ResolvedFile[],
  watermark: ExportWatermarkStyle,
  allowConversion = true,
) {
  if (!files.length) throw new Error('No files to share');
  const snapshot = files.map((file) =>
    Object.freeze({ uri: file.uri, entry: Object.freeze({ ...file.entry }) }),
  );
  return createRequest({
    kind: 'files',
    files: Object.freeze(snapshot),
    watermark,
    allowConversion,
  });
}

function createRequest(input: ShareSource & Pick<ShareRequest, 'watermark'>) {
  if (active) return undefined;
  const id = randomUUID();
  let resolve = () => {};
  const outcome = new Promise<void>((done) => {
    resolve = done;
  });
  active = {
    ...input,
    id,
    resolve,
    operations: new Set(),
    cleanups: new Set(),
    // Release a navigation request that never reached its route.
    timer: setTimeout(() => {
      void finishShareRequest(id);
    }, 30_000),
  };
  return { id, outcome };
}

export function claimShareRequest(id?: string) {
  if (!active || active.id !== id) return undefined;
  clearTimeout(active.timer);
  return active;
}

export async function finishShareRequest(id: string) {
  const request = active;
  if (!request || request.id !== id) return;
  // Retain admission until disposal settles, including late native capture.
  clearTimeout(request.timer);
  try {
    await Promise.allSettled([...request.operations]);
    await Promise.allSettled(
      [...request.cleanups].map((cleanup) => Promise.resolve().then(cleanup)),
    );
    if (request.kind === 'document') await Promise.allSettled([request.session.dispose()]);
  } finally {
    if (active === request) active = undefined;
    request.resolve();
  }
}

/** Keep source bytes alive until native copies and delivery have settled. */
export function retainShareOperation<T>(id: string, operation: Promise<T>): Promise<T> {
  const request = active;
  if (!request || request.id !== id) return operation;
  request.operations.add(operation);
  void operation.finally(() => request.operations.delete(operation)).catch(() => {});
  return operation;
}

export function registerShareCleanup(id: string, cleanup: () => Promise<unknown>) {
  if (active?.id === id) active.cleanups.add(cleanup);
}

export function getShareRequest(id?: string) {
  return active?.id === id ? active : undefined;
}

/** A remount can reclaim the request before the next task, without disposing its session. */
export function scheduleShareFinish(id: string) {
  if (active?.id !== id) return;
  clearTimeout(active.timer);
  active.timer = setTimeout(() => {
    void finishShareRequest(id);
  }, 0);
}
