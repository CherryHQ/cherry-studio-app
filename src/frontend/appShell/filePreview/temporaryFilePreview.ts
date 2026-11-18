import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';

import type { TemporaryFilePreview } from '@/shared/contracts/file';

type PreviewRequest = {
  file: TemporaryFilePreview;
  readers: number;
  timer?: ReturnType<typeof setTimeout>;
};

const requests = new Map<string, PreviewRequest>();

function finish(id: string) {
  const request = requests.get(id);
  if (!request) return;
  requests.delete(id);
  clearTimeout(request.timer);
  request.file.release();
}

/** Only opaque identities enter navigation; cache URIs and disposal stay in memory. */
export function openTemporaryFilePreview(file: TemporaryFilePreview) {
  const id = randomUUID();
  const request: PreviewRequest = { file, readers: 0 };
  requests.set(id, request);
  request.timer = setTimeout(() => finish(id), 30_000);
  try {
    router.push({
      pathname: '/files/[fileEntryId]',
      params: { fileEntryId: file.entry.id, previewRequestId: id },
    });
  } catch (error) {
    finish(id);
    throw error;
  }
}

export function getTemporaryFilePreview(id: string, fileId: string) {
  const request = requests.get(id);
  return request?.file.entry.id === fileId ? request.file : undefined;
}

/** Strict-effect remounts and another mounted reader can reclaim the same cache lease. */
export function retainTemporaryFilePreview(id: string) {
  const request = requests.get(id);
  if (!request) return;
  clearTimeout(request.timer);
  request.readers++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    request.readers--;
    if (request.readers === 0) request.timer = setTimeout(() => finish(id), 0);
  };
}
