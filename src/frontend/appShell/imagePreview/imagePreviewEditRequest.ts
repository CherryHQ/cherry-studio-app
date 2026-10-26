import { randomUUID } from 'expo-crypto';

import type { ResolvedFile } from '@/shared/contracts/file';
import type { FileEntryId } from '@/shared/data/types/file';

/** The caller decides whether this source still belongs to its draft. False rejects a stale save. */
export type ReplacePreviewImage = (sourceId: FileEntryId, replacement: ResolvedFile) => boolean;

type ImagePreviewEditRequest = {
  id: string;
  initialFileEntryId: FileEntryId;
  currentFileEntryId: FileEntryId;
  controller: AbortController;
  replace: ReplacePreviewImage;
  timer?: ReturnType<typeof setTimeout>;
};

const requests = new Map<string, ImagePreviewEditRequest>();

/** Navigation carries only an opaque id; callbacks and cancellation never enter route params. */
export function createImagePreviewEditRequest(
  fileEntryId: FileEntryId,
  replace: ReplacePreviewImage,
) {
  const request: ImagePreviewEditRequest = {
    id: randomUUID(),
    initialFileEntryId: fileEntryId,
    currentFileEntryId: fileEntryId,
    controller: new AbortController(),
    replace,
  };
  requests.set(request.id, request);
  // Release a request whose navigation never mounted a viewer.
  request.timer = setTimeout(() => finishImagePreviewEditRequest(request.id), 30_000);
  return request.id;
}

export function getImagePreviewEditRequest(
  id: string | undefined,
  initialFileEntryId: FileEntryId,
) {
  const request = id ? requests.get(id) : undefined;
  return request?.initialFileEntryId === initialFileEntryId ? request : undefined;
}

export function claimImagePreviewEditRequest(id: string) {
  const request = requests.get(id);
  if (request) {
    clearTimeout(request.timer);
    request.timer = undefined;
  }
}

export function replacePreviewImage(id: string, sourceId: FileEntryId, replacement: ResolvedFile) {
  const request = requests.get(id);
  if (!request || request.controller.signal.aborted || request.currentFileEntryId !== sourceId)
    return false;
  if (!request.replace(sourceId, replacement)) return false;
  request.currentFileEntryId = replacement.entry.id;
  return true;
}

export function finishImagePreviewEditRequest(id: string) {
  const request = requests.get(id);
  if (!request) return;
  requests.delete(id);
  clearTimeout(request.timer);
  request.controller.abort();
}

/** A strict-effect remount can reclaim the request before its deferred disposal. */
export function scheduleImagePreviewEditFinish(id: string) {
  const request = requests.get(id);
  if (!request) return;
  clearTimeout(request.timer);
  request.timer = setTimeout(() => finishImagePreviewEditRequest(id), 0);
}
