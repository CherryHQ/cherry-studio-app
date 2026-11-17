import { ReadableStream } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';

import { readHttpText } from '../readHttpText';

// Match the native UTF-8 decoder in Jest's React Native environment.
const originalDecoder = globalThis.TextDecoder;
beforeAll(() => {
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
});
afterAll(() => {
  globalThis.TextDecoder = originalDecoder;
});

function stream(...chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }) as unknown as globalThis.ReadableStream<Uint8Array>;
}

it('keeps short and exactly capped responses complete', async () => {
  const signal = new AbortController().signal;
  await expect(readHttpText(stream('a', 'bc'), 3, signal)).resolves.toEqual({
    text: 'abc',
    truncated: false,
  });
  await expect(readHttpText(null, 3, signal)).resolves.toEqual({ text: '', truncated: false });
});

it('caps bytes across chunks and omits an incomplete UTF-8 character', async () => {
  await expect(readHttpText(stream('a', '你好'), 5, new AbortController().signal)).resolves.toEqual(
    {
      text: 'a你',
      truncated: true,
    },
  );
});

it('cancels the unread body after truncation', async () => {
  const cancel = jest.fn();
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([65, 66, 67, 68]));
    },
    cancel,
  }) as unknown as globalThis.ReadableStream<Uint8Array>;
  await expect(readHttpText(source, 2, new AbortController().signal)).resolves.toEqual({
    text: 'AB',
    truncated: true,
  });
  expect(cancel).toHaveBeenCalledTimes(1);
});

it('releases a cancelled caller even when a source never responds or finishes cancellation', async () => {
  const controller = new AbortController();
  const source = new ReadableStream<Uint8Array>({
    cancel: () => new Promise(() => undefined),
  }) as unknown as globalThis.ReadableStream<Uint8Array>;
  const pending = readHttpText(source, 2, controller.signal);
  controller.abort(new Error('stopped'));
  await expect(pending).rejects.toThrow('stopped');
});
