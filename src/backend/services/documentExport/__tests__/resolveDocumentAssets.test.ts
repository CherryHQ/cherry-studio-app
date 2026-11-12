import { crc32 } from 'node:zlib';

import { fetch } from 'expo/fetch';

import { AiContentLabelSchema } from '@/shared/data/types/aiContent';

import { inspectImage, resolveDocumentAssets } from '../resolveDocumentAssets';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

const png = () =>
  Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=',
    ),
    (character) => character.charCodeAt(0),
  );

test('inspects dimensions without native decoding and rejects animated/active formats', () => {
  expect(inspectImage(png())).toEqual({ width: 1, height: 1, mediaType: 'image/png' });
  const animated = png();
  new DataView(animated.buffer).setUint32(37, 0x6163544c);
  expect(() => inspectImage(animated)).toThrow();
  expect(() => inspectImage(new TextEncoder().encode('<svg onload="alert(1)"></svg>'))).toThrow();
});

test.each([
  { width: 100_000, height: 1 },
  { width: 4000, height: 3000 },
])(
  'source header dimensions are admitted without an axis or pixel cap: %j',
  async ({ width, height }) => {
    const source = png();
    new DataView(source.buffer).setUint32(16, width);
    new DataView(source.buffer).setUint32(20, height);
    const cache = new Map();
    const result = await resolveDocumentAssets(
      new Map([
        ['first', { kind: 'managed-file', fileEntryId: 'first' }],
        ['second', { kind: 'managed-file', fileEntryId: 'second' }],
      ]),
      cache,
      async () => source,
      new AbortController().signal,
    );
    expect(result.images.size).toBe(2);
    expect(result.issues).toEqual([]);
    expect(cache.size).toBe(2);
  },
);

test('zero image dimensions still produce a retryable placeholder', async () => {
  const source = png();
  new DataView(source.buffer).setUint32(16, 0);
  const cache = new Map();
  const result = await resolveDocumentAssets(
    new Map([['asset', { kind: 'managed-file', fileEntryId: 'file' }]]),
    cache,
    async () => source,
    new AbortController().signal,
  );
  expect(result.images.size).toBe(0);
  expect(result.issues).toHaveLength(1);
  expect(cache.size).toBe(0);
});

test.each(['1', '2', '3'] as const)(
  'retains image declarations from used assets and cache entries (Label=%s)',
  async (Label) => {
    const label = AiContentLabelSchema.parse({
      Label,
      ContentProducer: 'ProviderExample',
      ProduceID: 'image-1',
      ReservedCode1: '',
      ContentPropagator: 'RelayExample',
      PropagateID: 'relay-1',
      ReservedCode2: '',
    });
    const payload = Buffer.from('AIGC\0' + JSON.stringify(label));
    const chunk = Buffer.alloc(payload.length + 12);
    chunk.writeUInt32BE(payload.length);
    chunk.write('tEXt', 4);
    chunk.set(payload, 8);
    chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
    const raw = png();
    const labeled = new Uint8Array(Buffer.concat([raw.subarray(0, -12), chunk, raw.subarray(-12)]));
    const read = jest.fn(async (id: string) => {
      if (id === 'missing') throw new Error('Image unavailable');
      return id === 'ai' ? labeled : raw;
    });
    const sources = new Map([
      ['answer:image', { kind: 'managed-file' as const, fileEntryId: 'ai' }],
    ]);
    const cache = new Map();
    const signal = new AbortController().signal;
    expect((await resolveDocumentAssets(sources, cache, read, signal)).aiContentLabel).toEqual(
      label,
    );
    expect((await resolveDocumentAssets(sources, cache, read, signal)).aiContentLabel).toEqual(
      label,
    );
    expect(read).toHaveBeenCalledTimes(1);
    for (const id of ['ordinary', 'missing']) {
      const other = await resolveDocumentAssets(
        new Map([['other', { kind: 'managed-file', fileEntryId: id }]]),
        cache,
        read,
        signal,
      );
      expect(other.aiContentLabel).toBeNull();
    }
  },
);

test('the same managed image at different transcript positions is read once and cached by source', async () => {
  const read = jest.fn(async () => png());
  const cache = new Map();
  const sources = new Map([
    ['answer:first', { kind: 'managed-file' as const, fileEntryId: 'image' }],
    ['answer:again', { kind: 'managed-file' as const, fileEntryId: 'image' }],
  ]);
  const result = await resolveDocumentAssets(sources, cache, read, new AbortController().signal);
  expect(result.images.size).toBe(2);
  expect(read).toHaveBeenCalledTimes(1);
  await resolveDocumentAssets(sources, cache, read, new AbortController().signal);
  expect(read).toHaveBeenCalledTimes(1);
});

test.each([null, String(5 * 1024 * 1024)])(
  'remote streams read beyond the former byte cap (content-length: %s)',
  async (contentLength) => {
    const padding = new Uint8Array(5 * 1024 * 1024);
    const read = jest
      .fn()
      .mockResolvedValueOnce({ done: false, value: png() })
      .mockResolvedValueOnce({ done: false, value: padding })
      .mockResolvedValueOnce({ done: true });
    const cancel = jest.fn(async () => {});
    jest.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => contentLength },
      body: { getReader: () => ({ read, cancel }) },
    } as never);
    const result = await resolveDocumentAssets(
      new Map([['remote', { kind: 'remote-image', url: 'https://example.com/photo.png' }]]),
      new Map(),
      jest.fn(),
      new AbortController().signal,
    );
    expect(result.issues).toEqual([]);
    const dataUrl = result.images.get('remote')!;
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(atob(dataUrl.split(',')[1]).length).toBe(png().length + padding.length);
    expect(read).toHaveBeenCalledTimes(3);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/photo.png',
      expect.objectContaining({ credentials: 'omit', redirect: 'error' }),
    );
  },
);

test('cancelling a remote read releases its stream without caching a partial image', async () => {
  const controller = new AbortController();
  const read = jest.fn(async () => {
    controller.abort();
    return { done: false, value: png() };
  });
  const cancel = jest.fn(async () => {});
  jest.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    body: { getReader: () => ({ read, cancel }) },
  } as never);
  const cache = new Map();
  await expect(
    resolveDocumentAssets(
      new Map([['remote', { kind: 'remote-image', url: 'https://example.com/photo.png' }]]),
      cache,
      jest.fn(),
      controller.signal,
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(read).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(cache.size).toBe(0);
});
