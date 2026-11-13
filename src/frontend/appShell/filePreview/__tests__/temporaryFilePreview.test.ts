import { randomUUID as mockRandomUUID } from 'node:crypto';

import type { TemporaryFilePreview } from '@/shared/contracts/file';

import {
  getTemporaryFilePreview,
  openTemporaryFilePreview,
  retainTemporaryFilePreview,
} from '../temporaryFilePreview';

const mockPush = jest.fn();
jest.mock('expo-crypto', () => ({ randomUUID: mockRandomUUID }));
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

let file: TemporaryFilePreview;

beforeEach(() => {
  jest.useFakeTimers();
  mockPush.mockReset();
  file = {
    entry: {
      id: mockRandomUUID(),
      filename: '你好.txt',
      mediaType: 'text/plain',
      size: 12,
      updatedAt: 1,
      provenance: 'unknown',
    },
    uri: 'file:///cache/private/preview.txt',
    release: jest.fn(),
  };
});
afterEach(() => {
  jest.runAllTimers();
  jest.useRealTimers();
});

function open() {
  openTemporaryFilePreview(file);
  return mockPush.mock.calls.at(-1)![0].params.previewRequestId as string;
}

test('navigation contains only identities and cannot resolve another source or an arbitrary URI', () => {
  const id = open();
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/files/[fileEntryId]',
    params: { fileEntryId: file.entry.id, previewRequestId: id },
  });
  expect(JSON.stringify(mockPush.mock.calls)).not.toContain(file.uri);
  expect(getTemporaryFilePreview(id, file.entry.id)).toBe(file);
  expect(getTemporaryFilePreview(id, mockRandomUUID())).toBeUndefined();
  expect(getTemporaryFilePreview(file.uri, file.entry.id)).toBeUndefined();
});

test('failed navigation releases immediately and an unclaimed request expires after 30 seconds', () => {
  mockPush.mockImplementationOnce(() => {
    throw new Error('Navigation failed');
  });
  expect(() => openTemporaryFilePreview(file)).toThrow('Navigation failed');
  expect(file.release).toHaveBeenCalledTimes(1);
  const id = open();
  jest.advanceTimersByTime(29_999);
  expect(getTemporaryFilePreview(id, file.entry.id)).toBe(file);
  jest.advanceTimersByTime(1);
  expect(getTemporaryFilePreview(id, file.entry.id)).toBeUndefined();
  expect(file.release).toHaveBeenCalledTimes(2);
});

test('a mounted reader survives expiry and strict-effect remount, releasing only after its last reader', () => {
  const id = open();
  const first = retainTemporaryFilePreview(id)!;
  jest.advanceTimersByTime(60_000);
  expect(file.release).not.toHaveBeenCalled();
  first();
  const remount = retainTemporaryFilePreview(id)!;
  jest.advanceTimersByTime(0);
  expect(file.release).not.toHaveBeenCalled();
  const second = retainTemporaryFilePreview(id)!;
  remount();
  remount();
  jest.advanceTimersByTime(0);
  expect(getTemporaryFilePreview(id, file.entry.id)).toBe(file);
  second();
  jest.advanceTimersByTime(0);
  expect(getTemporaryFilePreview(id, file.entry.id)).toBeUndefined();
  expect(file.release).toHaveBeenCalledTimes(1);
});
