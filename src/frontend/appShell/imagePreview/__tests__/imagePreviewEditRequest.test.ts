import type { ResolvedFile } from '@/shared/contracts/file';
import { FileEntrySchema } from '@/shared/data/types/file';

import {
  claimImagePreviewEditRequest,
  createImagePreviewEditRequest,
  finishImagePreviewEditRequest,
  getImagePreviewEditRequest,
  replacePreviewImage,
  scheduleImagePreviewEditFinish,
} from '../imagePreviewEditRequest';

const SOURCE = '00000000-0000-4000-8000-000000000001';
const RESULT = '00000000-0000-4000-8000-000000000002';
const replacement: ResolvedFile = {
  entry: FileEntrySchema.parse({
    id: RESULT,
    filename: 'image v2.png',
    mediaType: 'image/png',
    provenance: 'imported',
    size: 1,
    createdAt: 1,
    updatedAt: 1,
  }),
  uri: 'file:///managed/edited.png',
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

test('adopts one replacement and rejects an older source on a later completion', () => {
  const replace = jest.fn(() => true);
  const id = createImagePreviewEditRequest(SOURCE, replace);
  claimImagePreviewEditRequest(id);
  expect(getImagePreviewEditRequest(id, RESULT)).toBeUndefined();
  expect(replacePreviewImage(id, SOURCE, replacement)).toBe(true);
  expect(replacePreviewImage(id, SOURCE, replacement)).toBe(false);
  expect(replace).toHaveBeenCalledTimes(1);
  finishImagePreviewEditRequest(id);
});

test('source-owner disposal aborts the pending operation and prevents draft mutation', () => {
  const replace = jest.fn(() => true);
  const id = createImagePreviewEditRequest(SOURCE, replace);
  const signal = getImagePreviewEditRequest(id, SOURCE)!.controller.signal;
  finishImagePreviewEditRequest(id);
  expect(signal.aborted).toBe(true);
  expect(replacePreviewImage(id, SOURCE, replacement)).toBe(false);
  expect(replace).not.toHaveBeenCalled();
});

test('a remount can reclaim the request, while an abandoned navigation expires', () => {
  const id = createImagePreviewEditRequest(SOURCE, () => false);
  scheduleImagePreviewEditFinish(id);
  claimImagePreviewEditRequest(id);
  jest.runOnlyPendingTimers();
  expect(getImagePreviewEditRequest(id, SOURCE)).toBeDefined();
  expect(replacePreviewImage(id, SOURCE, replacement)).toBe(false);
  expect(getImagePreviewEditRequest(id, SOURCE)!.currentFileEntryId).toBe(SOURCE);
  finishImagePreviewEditRequest(id);
  const abandoned = createImagePreviewEditRequest(SOURCE, () => true);
  jest.advanceTimersByTime(30_000);
  expect(getImagePreviewEditRequest(abandoned, SOURCE)).toBeUndefined();
});
