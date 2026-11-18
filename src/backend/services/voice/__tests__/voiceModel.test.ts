import * as FileSystem from 'expo-file-system/legacy';

import { downloadFile, FileDownloadError } from '@/backend/services/download';
import { hashLocalFile } from '@/backend/services/file/fileHash';

import { SENSE_VOICE_ASSETS, SENSE_VOICE_BYTES, SENSE_VOICE_DIRECTORY } from '../senseVoiceAssets';
import { createVoiceModel } from '../voiceModel';

jest.mock('../../../../../modules/voice-input', () => ({
  getVoiceInput: () => ({ modelDirectory: async () => 'file:///models/' }),
}));
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
  deleteAsync: jest.fn(async () => {}),
}));
jest.mock('@/backend/services/download', () => ({
  ...jest.requireActual('@/backend/services/download'),
  downloadFile: jest.fn(),
}));
jest.mock('@/backend/services/file/fileHash', () => ({ hashLocalFile: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(FileSystem.getInfoAsync)
    .mockImplementation(async (uri) => ({ exists: false, isDirectory: false, uri }));
  jest.mocked(downloadFile).mockImplementation(async ({ destination }) => destination);
});

test.each(['CN', 'US'])(
  'partial model installs are never ready and %s assets keep pinned integrity',
  async (country) => {
    const model = createVoiceModel(async () => country);
    await expect(model.isReady(new AbortController().signal)).resolves.toBe(false);
    await model.module.download();
    expect(model.module.getState()).toMatchObject({
      status: 'ready',
      receivedBytes: SENSE_VOICE_BYTES,
    });
    for (const asset of SENSE_VOICE_ASSETS)
      expect(downloadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          url: country === 'CN' ? asset.url : expect.stringMatching(/^https:\/\/huggingface\.co\//),
          sha256: asset.sha256,
          bytes: asset.bytes,
          maxBytes: asset.bytes,
          destination: `file:///models/${SENSE_VOICE_DIRECTORY}/${asset.name}`,
        }),
      );
  },
);

test('model deletion is rejected for the entire native-use lease', async () => {
  const model = createVoiceModel(async () => 'CN');
  await model.module.download();
  const lease = await model.acquire(new AbortController().signal);
  await expect(model.module.remove()).rejects.toMatchObject({ code: 'busy' });
  expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  lease.release();
  await model.module.remove();
  expect(model.module.getState()).toMatchObject({ status: 'not-downloaded', receivedBytes: 0 });
});

test('a corrupt cached model cannot be admitted after restarting the app', async () => {
  jest.mocked(FileSystem.getInfoAsync).mockImplementation(async (uri) => ({
    exists: true,
    isDirectory: false,
    uri,
    size: SENSE_VOICE_ASSETS.find((asset) => uri.endsWith(asset.name))!.bytes,
    modificationTime: 1,
  }));
  jest.mocked(hashLocalFile).mockResolvedValue('bad-checksum');
  const model = createVoiceModel(async () => 'CN');
  await expect(model.isReady(new AbortController().signal)).resolves.toBe(false);
  await expect(model.acquire(new AbortController().signal)).rejects.toMatchObject({
    code: 'model-not-downloaded',
  });
});

test('download failures remain visible until retry and cannot become ready through status reads', async () => {
  jest.mocked(downloadFile).mockRejectedValue(new FileDownloadError('verification'));
  const model = createVoiceModel(async () => 'CN');
  await expect(model.module.download()).rejects.toMatchObject({ code: 'verification' });
  await expect(model.isReady(new AbortController().signal)).resolves.toBe(false);
  expect(model.module.getState()).toMatchObject({ status: 'failed', failure: 'verification' });
  jest.mocked(downloadFile).mockImplementation(async ({ destination }) => destination);
  await model.module.download();
  expect(model.module.getState().status).toBe('ready');
});

test.each(['cancel', 'dispose'] as const)(
  '%s releases a pending country wait without cancelling the shared lookup',
  async (action) => {
    let finishCountry!: (value: string) => void;
    const country = new Promise<string>((resolve) => {
      finishCountry = resolve;
    });
    let countryRequested!: () => void;
    const requested = new Promise<void>((resolve) => {
      countryRequested = resolve;
    });
    const model = createVoiceModel(() => {
      countryRequested();
      return country;
    });
    const downloading = model.module.download();
    try {
      await requested;
      let stopped = false;
      const stopping = (action === 'cancel' ? model.module.cancel() : model.dispose()).then(() => {
        stopped = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(stopped).toBe(true);
      expect(model.module.getState().status).toBe('not-downloaded');
      expect(downloadFile).not.toHaveBeenCalled();

      finishCountry('US');
      await Promise.all([downloading, stopping]);
      await expect(country).resolves.toBe('US');
      expect(downloadFile).not.toHaveBeenCalled();

      if (action === 'cancel') {
        await model.module.download();
        expect(model.module.getState().status).toBe('ready');
      } else {
        await expect(model.module.download()).rejects.toThrow('stopped');
      }
    } finally {
      finishCountry('US');
      await model.dispose();
      await downloading;
    }
  },
);

test('immediate cancellation does not start a country lookup', async () => {
  const getCountry = jest.fn(async () => 'CN');
  const model = createVoiceModel(getCountry);
  const downloading = model.module.download();
  await model.module.cancel();
  await downloading;
  expect(getCountry).not.toHaveBeenCalled();
  expect(downloadFile).not.toHaveBeenCalled();
  await model.dispose();
});

test('disposal cancels and joins downloads before rejecting new work', async () => {
  let rejectDownload!: (reason: unknown) => void;
  let signal!: AbortSignal;
  jest.mocked(downloadFile).mockImplementation((options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => {
      rejectDownload = reject;
    });
  });
  const model = createVoiceModel(async () => 'CN');
  const downloading = model.module.download();
  await new Promise((resolve) => setTimeout(resolve, 0));
  let disposed = false;
  const disposal = model.dispose().then(() => {
    disposed = true;
  });
  expect(signal.aborted).toBe(true);
  expect(disposed).toBe(false);
  rejectDownload(signal.reason);
  await Promise.all([downloading, disposal]);
  expect(model.module.getState().status).toBe('not-downloaded');
  await expect(model.module.download()).rejects.toThrow('stopped');
});
