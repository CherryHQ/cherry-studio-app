import { raceAbort } from '@/backend/utils/raceAbort';

/** Keep at most the requested UTF-8 bytes, then cancel the unread response. */
export async function readHttpText(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  signal: AbortSignal,
): Promise<{ text: string; truncated: boolean }> {
  signal.throwIfAborted();
  if (!stream) return { text: '', truncated: false };
  const reader = stream.getReader();
  const bytes = new Uint8Array(maxBytes);
  let size = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await raceAbort(reader.read(), signal);
      if (done) break;
      const count = Math.min(value.byteLength, maxBytes - size);
      bytes.set(value.subarray(0, count), size);
      size += count;
      if (count < value.byteLength) {
        truncated = true;
        break;
      }
    }
    signal.throwIfAborted();
    return {
      // A truncated prefix may end inside a UTF-8 character. Do not flush that partial character.
      text: new TextDecoder().decode(bytes.subarray(0, size), { stream: truncated }),
      truncated,
    };
  } finally {
    // Cancellation must not keep the caller waiting for an unresponsive source.
    void reader
      .cancel()
      .then(() => reader.releaseLock())
      .catch(() => undefined);
  }
}
