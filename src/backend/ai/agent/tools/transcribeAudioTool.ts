import * as z from 'zod';

import { VoiceError, type VoiceEngineId, type VoiceModule } from '@/shared/contracts/voice';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import type { RuntimeTool, RuntimeToolResult } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';
import type { WorkspaceFileAccess } from './workspaceFileAccess';

const inputSchema = z.strictObject({
  file_entry_id: FileEntryIdSchema.optional().describe(
    'Managed audio file id from an attachment or workspace.',
  ),
  path: z
    .string()
    .min(1)
    .max(4096)
    .optional()
    .describe('Relative workspace path instead of file_entry_id.'),
});

export function createTranscribeAudioTool(
  voice: Pick<VoiceModule, 'transcribeAudio'>,
  access: Pick<WorkspaceFileAccess, 'resolveRead' | 'folderId'>,
  engine: VoiceEngineId,
): RuntimeTool {
  const processing =
    engine === 'deepseek'
      ? 'Audio windows are sent to DeepSeek for cloud transcription.'
      : 'The selected on-device engine transcribes the audio locally.';
  return {
    ref: { source: 'builtin', capabilityId: 'transcribe_audio' },
    providerName: 'transcribe_audio',
    displayName: 'Transcribe audio',
    description: `Transcribe an attached or workspace audio recording. ${processing} Accepts platform-decodable audio up to 100 MiB and two hours. Saves a text document in the current workspace (library root otherwise). Use read_file on its returned fileEntryId to read the transcript. Recognition can contain errors and does not identify speakers.`,
    inputSchema: toRuntimeInputSchema(inputSchema),
    executionSettingsKey: engine,
    approval: 'auto',
    async execute({ input, signal, toolCallId }): Promise<RuntimeToolResult> {
      const parsed = inputSchema.safeParse(input);
      if (!parsed.success)
        return {
          value: { status: 'error', message: z.prettifyError(parsed.error) },
          artifacts: [],
        };
      const fileEntryId = await access.resolveRead(parsed.data);
      signal.throwIfAborted();
      try {
        const { entry, durationSeconds } = await voice.transcribeAudio(
          { fileEntryId, folderId: access.folderId },
          { signal, key: toolCallId, expectedEngine: engine },
        );
        return {
          value: {
            status: 'created',
            fileEntryId: entry.id,
            filename: entry.filename,
            size: entry.size,
            durationSeconds,
          },
          artifacts: [
            {
              ref: { kind: 'managed-file', fileEntryId: entry.id },
              name: entry.filename,
              mediaType: entry.mediaType,
              kind: 'created',
            },
          ],
        };
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof VoiceError)
          return {
            value: { status: 'error', code: error.code, message: error.message },
            artifacts: [],
          };
        throw error;
      }
    },
  };
}
