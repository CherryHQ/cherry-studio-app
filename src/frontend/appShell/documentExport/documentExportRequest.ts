import { randomUUID } from 'expo-crypto';

import type { DocumentExportSession, ExportFormat } from '@/shared/contracts/documentExport';

export type DocumentExportOption = { label: string; uncheckedSession: DocumentExportSession };

type ExportRequest = {
  id: string;
  session: DocumentExportSession;
  initialFormat: ExportFormat;
  option?: DocumentExportOption;
  resolve(): void;
  timer: ReturnType<typeof setTimeout>;
};
let active: ExportRequest | undefined;

export function createDocumentExportRequest(
  session: DocumentExportSession,
  initialFormat: ExportFormat,
  option?: DocumentExportOption,
) {
  if (active) return undefined;
  const id = randomUUID();
  let resolve = () => {};
  const outcome = new Promise<void>((done) => {
    resolve = done;
  });
  active = {
    id,
    session,
    initialFormat,
    option,
    resolve,
    // Release a navigation request that never reached its route.
    timer: setTimeout(() => {
      void finishDocumentExportRequest(id);
    }, 30_000),
  };
  return { id, outcome };
}

export function claimDocumentExportRequest(id?: string) {
  if (!active || active.id !== id) return undefined;
  clearTimeout(active.timer);
  return active;
}

export async function finishDocumentExportRequest(id: string) {
  const request = active;
  if (!request || request.id !== id) return;
  // Retain admission until disposal settles, including late native capture.
  clearTimeout(request.timer);
  try {
    await Promise.allSettled([
      request.session.dispose(),
      request.option?.uncheckedSession.dispose(),
    ]);
  } finally {
    if (active === request) active = undefined;
    request.resolve();
  }
}

export function getDocumentExportRequest(id?: string) {
  return active?.id === id ? active : undefined;
}

/** A remount can reclaim the request before the next task, without disposing its session. */
export function scheduleDocumentExportFinish(id: string) {
  if (active?.id !== id) return;
  clearTimeout(active.timer);
  active.timer = setTimeout(() => {
    void finishDocumentExportRequest(id);
  }, 0);
}
