import { FileEntrySchema } from '@/shared/data/types/file';
import { MAX_AUDIO_FILE_BYTES } from '@/shared/utils/audioFileTypes';

import { transcribeAudioFile } from '../transcribeAudioFile';

const source = FileEntrySchema.parse({
  id: '00000000-0000-7000-8000-000000000001',
  filename: 'meeting.m4a',
  mediaType: 'audio/mp4',
  provenance: 'imported',
  size: 100,
  createdAt: 1,
  updatedAt: 1,
});
const transcript = FileEntrySchema.parse({
  ...source,
  id: '00000000-0000-7000-8000-000000000002',
  filename: 'meeting.txt',
  mediaType: 'text/plain',
  provenance: 'generated',
});
function setup() {
  const controller = new AbortController();
  const files = {
    resolve: jest.fn(async () => ({ entry: source, uri: 'file:///recording.m4a' })),
    createTextEntry: jest.fn(async () => transcript),
    delete: jest.fn(async () => {}),
  };
  const transcribe = jest.fn(async () => ({ text: 'Meeting notes.', durationSeconds: 45 }));
  const input = { fileEntryId: source.id, folderId: '00000000-0000-7000-8000-000000000003' };
  return {
    controller,
    files,
    transcribe,
    input,
    run: () => transcribeAudioFile(files, transcribe, input, { signal: controller.signal }),
  };
}

test('publishes a separate readable document in the selected folder and preserves the source', async () => {
  const { files, run, input } = setup();
  await expect(run()).resolves.toEqual({ entry: transcript, durationSeconds: 45 });
  expect(files.createTextEntry).toHaveBeenCalledWith(
    expect.objectContaining({
      data: 'Meeting notes.\n',
      mediaType: 'text/plain',
      name: 'meeting.txt',
      provenance: 'generated',
      folderId: input.folderId,
      workspaceFolderId: input.folderId,
    }),
    expect.any(AbortSignal),
  );
  expect(files.delete).not.toHaveBeenCalled();
});

test.each([
  [{ mediaType: 'text/plain' }, 'invalid-audio'],
  [{ size: MAX_AUDIO_FILE_BYTES + 1 }, 'file-too-large'],
])('rejects an inadmissible source before native inference', async (changes, code) => {
  const { files, transcribe, run } = setup();
  files.resolve.mockResolvedValue({
    entry: FileEntrySchema.parse({ ...source, ...changes }),
    uri: 'file:///source',
  });
  await expect(run()).rejects.toMatchObject({ code });
  expect(transcribe).not.toHaveBeenCalled();
  expect(files.createTextEntry).not.toHaveBeenCalled();
});

test('does not publish a transcript after the source version changes', async () => {
  const { files, run } = setup();
  files.resolve.mockResolvedValueOnce({ entry: source, uri: 'file:///source' });
  files.resolve.mockResolvedValue({
    entry: FileEntrySchema.parse({ ...source, updatedAt: 2 }),
    uri: 'file:///source',
  });
  await expect(run()).rejects.toMatchObject({ code: 'file-unavailable' });
  expect(files.createTextEntry).not.toHaveBeenCalled();
});

test('cancellation after inference never publishes a partial document', async () => {
  const { controller, files, transcribe, run } = setup();
  transcribe.mockImplementation(async () => {
    controller.abort();
    return { text: 'Partial', durationSeconds: 30 };
  });
  await expect(run()).rejects.toBe(controller.signal.reason);
  expect(files.createTextEntry).not.toHaveBeenCalled();
});

test('cancellation crossing the publication boundary removes only the new transcript', async () => {
  const { controller, files, run } = setup();
  files.createTextEntry.mockImplementation(async () => {
    controller.abort();
    return transcript;
  });
  await expect(run()).rejects.toBe(controller.signal.reason);
  expect(files.delete).toHaveBeenCalledWith(transcript.id);
  expect(files.delete).not.toHaveBeenCalledWith(source.id);
});
