import type { SystemSharedFile } from '@/shared/contracts';

import type {
  NativeSystemEntry,
  SystemIntegrationNativeModule,
} from '../../../../../modules/system-integration';
import { createSystemEntryModule } from '../createSystemEntryModule';

const id = '42f7f701-37d6-4731-b7a8-8e7f3040be55';
const file: SystemSharedFile = {
  fileEntryId: 'ac3a0b0e-1f30-4e5c-8a51-6d0f51a5b2c7',
  mediaType: 'image/jpeg',
  name: 'photo.jpg',
  size: 1024,
  uri: 'file:///library/photo.jpg',
};

function setup() {
  const entry: NativeSystemEntry = {
    version: 1,
    id,
    createdAt: Date.now(),
    kind: 'share.receive',
    text: 'hello',
    files: [
      { uri: 'file:///staged/photo.jpg', name: 'photo.jpg', mediaType: 'image/jpeg', size: 1024 },
    ],
  };
  const native = {
    claimNextEntry: jest.fn(async () => entry),
    completeEntry: jest.fn(async () => {}),
    releaseEntry: jest.fn(async () => {}),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  };
  const importFiles = jest.fn(async (_entry: NativeSystemEntry, _signal: AbortSignal) => [file]);
  const runtime = createSystemEntryModule({
    importFiles,
    native: native as unknown as SystemIntegrationNativeModule,
  });
  return { runtime, native, importFiles };
}

test('a claimed share arrives as library files and leaves no native staging behind', async () => {
  const { runtime, native, importFiles } = setup();

  const action = await runtime.module.claimNext();

  expect(action).toEqual({ kind: 'share.receive', text: 'hello', files: [file] });
  expect(importFiles).toHaveBeenCalledTimes(1);
  expect(native.completeEntry).toHaveBeenCalledWith(id);
  expect(native.releaseEntry).not.toHaveBeenCalled();
  await runtime.dispose();
});

test('an import failure leaves the share staged for a later claim', async () => {
  const { runtime, native, importFiles } = setup();
  importFiles.mockRejectedValueOnce(new Error('disk full'));

  await expect(runtime.module.claimNext()).rejects.toThrow('System share import failed');
  expect(native.releaseEntry).toHaveBeenCalledWith(id);
  expect(native.completeEntry).not.toHaveBeenCalled();
  await runtime.dispose();
});

test('an invalid entry does not block the next valid share in the same pass', async () => {
  const { runtime, native } = setup();
  const rejectedId = '6720369c-029e-42f1-9d41-89f2873dbe5a';
  native.claimNextEntry.mockResolvedValueOnce({
    version: 1,
    id: rejectedId,
    createdAt: Date.now(),
    kind: 'share.receive',
    text: '',
    files: [],
  });

  const action = await runtime.module.claimNext();

  expect(action).toMatchObject({ kind: 'share.receive', text: 'hello' });
  expect(native.completeEntry).toHaveBeenCalledWith(rejectedId);
  await runtime.dispose();
});

test('disposal aborts an in-flight import and releases the share', async () => {
  const { runtime, native, importFiles } = setup();
  let observed: AbortSignal | undefined;
  importFiles.mockImplementationOnce(
    (_entry, signal) =>
      new Promise((_resolve, reject) => {
        observed = signal;
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
  );

  const claim = runtime.module.claimNext();
  await Promise.resolve();
  await runtime.dispose();

  await expect(claim).rejects.toThrow('System share import failed');
  expect(observed?.aborted).toBe(true);
  expect(native.releaseEntry).toHaveBeenCalledWith(id);
});
