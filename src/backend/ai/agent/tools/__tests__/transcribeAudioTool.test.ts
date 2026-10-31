import { VoiceError } from '@/shared/contracts/voice';
import { FileEntrySchema } from '@/shared/data/types/file';

import type { RuntimeTool } from '../../runtime';
import { createTranscribeAudioTool } from '../transcribeAudioTool';

const sourceId = '00000000-0000-7000-8000-000000000001';
const transcript = FileEntrySchema.parse({
  id: '00000000-0000-7000-8000-000000000002',
  filename: 'meeting.txt',
  mediaType: 'text/plain',
  provenance: 'generated',
  size: 25,
  createdAt: 1,
  updatedAt: 1,
});
const execute = (tool: RuntimeTool) =>
  tool.execute({
    input: { file_entry_id: sourceId },
    signal: new AbortController().signal,
    toolCallId: 'call-1',
    turnId: 'turn-1',
  });

test('enforces the conversation or workspace scope before reading audio', async () => {
  const voice = { transcribeAudio: jest.fn() };
  const denied = new Error('Outside workspace');
  const tool = createTranscribeAudioTool(voice, {
    folderId: null,
    resolveRead: async () => {
      throw denied;
    },
  });
  await expect(execute(tool)).rejects.toBe(denied);
  expect(voice.transcribeAudio).not.toHaveBeenCalled();
});

test('returns a managed artifact for read_file without returning audio or transcript bodies', async () => {
  const voice = {
    transcribeAudio: jest.fn(async () => ({ entry: transcript, durationSeconds: 60 })),
  };
  const folderId = '00000000-0000-7000-8000-000000000003';
  const tool = createTranscribeAudioTool(voice, { folderId, resolveRead: async () => sourceId });
  const result = await execute(tool);
  expect(voice.transcribeAudio).toHaveBeenCalledWith(
    { fileEntryId: sourceId, folderId },
    { signal: expect.any(AbortSignal), key: 'call-1' },
  );
  expect(result).toEqual({
    value: {
      status: 'created',
      fileEntryId: transcript.id,
      filename: transcript.filename,
      size: transcript.size,
      durationSeconds: 60,
    },
    artifacts: [
      {
        ref: { kind: 'managed-file', fileEntryId: transcript.id },
        mediaType: 'text/plain',
        name: transcript.filename,
        kind: 'created',
      },
    ],
  });
});

test('reports an actionable offline-model failure to the model', async () => {
  const tool = createTranscribeAudioTool(
    {
      transcribeAudio: async () => {
        throw new VoiceError('model-not-downloaded', 'Download the offline model first.');
      },
    },
    { folderId: null, resolveRead: async () => sourceId },
  );
  await expect(execute(tool)).resolves.toMatchObject({
    value: { status: 'error', code: 'model-not-downloaded' },
    artifacts: [],
  });
});
