import { raceAbort } from '@/backend/utils/raceAbort';
import { FileAttachmentError, type FileAttachmentFact } from '@/shared/contracts/fileAttachment';
import { VoiceError } from '@/shared/contracts/voice';
import { transcriptionMediaType } from '@/shared/utils/audioFileTypes';

import type { AiTranscriber, TranscriptionResult } from './aiTranscription';

/** Transcripts per file revision, so later turns and model changes do not transcribe again. */
export type TranscriptCache = {
  read(file: FileAttachmentFact): Promise<string | undefined>;
  write(file: FileAttachmentFact, text: string): Promise<void>;
};

function timestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const [hours, minutes, rest] = [
    Math.floor(total / 3600),
    Math.floor(total / 60) % 60,
    total % 60,
  ];
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

/** Model-facing text: a header saying it is a transcript, then timed segments when available. */
export function formatTranscript(result: TranscriptionResult): string {
  const segments = result.segments.filter((segment) => segment.text.trim());
  const body = segments.length
    ? segments.map((segment) => `[${timestamp(segment.startSecond)}] ${segment.text.trim()}`)
    : [result.text.trim()];
  if (!body.join('').trim()) return '';
  const facts = [
    result.language && `language: ${result.language}`,
    result.durationInSeconds !== undefined && `duration: ${timestamp(result.durationInSeconds)}`,
  ].filter(Boolean);
  return [`[Audio transcript${facts.length ? `; ${facts.join('; ')}` : ''}]`, ...body].join('\n');
}

type Flight = { promise: Promise<string>; controller: AbortController; waiters: number };

/**
 * Adapts the transcription model to the attachment reader port. Failures become attachment
 * issues so chat and file tools report them like any other unreadable file.
 *
 * Readers of one file revision share a single request: parallel answers and tool calls would
 * otherwise each upload and pay for the same audio. The request is cancelled only when every
 * reader waiting for it has cancelled.
 */
export function createAudioFileTranscriber(transcriber: AiTranscriber, cache: TranscriptCache) {
  const flights = new Map<string, Flight>();

  async function transcribeOnce(
    file: FileAttachmentFact,
    readBytes: (signal: AbortSignal) => Promise<Uint8Array | undefined>,
    signal: AbortSignal,
  ): Promise<string> {
    const issue = { fileEntryId: file.fileEntryId, name: file.name };
    const model = await transcriber.selection();
    signal.throwIfAborted();
    if (!model) throw new FileAttachmentError({ ...issue, code: 'transcription-unconfigured' });
    const bytes = await readBytes(signal);
    signal.throwIfAborted();
    if (!bytes) throw new FileAttachmentError({ ...issue, code: 'unavailable' });
    let text: string;
    try {
      text = formatTranscript(
        await transcriber.transcribe(
          { audio: bytes, mediaType: transcriptionMediaType(file) ?? file.mediaType },
          signal,
          model,
        ),
      );
    } catch (error) {
      signal.throwIfAborted();
      throw new FileAttachmentError(
        {
          ...issue,
          code:
            error instanceof VoiceError && error.code === 'not-configured'
              ? 'transcription-unconfigured'
              : 'transcription-failed',
        },
        { cause: error },
      );
    }
    if (!text) throw new FileAttachmentError({ ...issue, code: 'transcription-empty' });
    await cache.write(file, text).catch(() => undefined);
    return text;
  }

  return async function transcribeAudioFile(
    file: FileAttachmentFact,
    readBytes: (signal: AbortSignal) => Promise<Uint8Array | undefined>,
    signal: AbortSignal,
  ): Promise<string> {
    const cached = await cache.read(file).catch(() => undefined);
    signal.throwIfAborted();
    if (cached) return cached;
    const key = `${file.fileEntryId}/${file.revision ?? 0}/${file.size}`;
    let flight = flights.get(key);
    if (!flight) {
      const controller = new AbortController();
      const promise = transcribeOnce(file, readBytes, controller.signal).finally(() =>
        flights.delete(key),
      );
      promise.catch(() => undefined);
      flight = { promise, controller, waiters: 0 };
      flights.set(key, flight);
    }
    const joined = flight;
    joined.waiters += 1;
    try {
      return await raceAbort(joined.promise, signal);
    } finally {
      joined.waiters -= 1;
      if (joined.waiters === 0 && signal.aborted) joined.controller.abort(signal.reason);
    }
  };
}
