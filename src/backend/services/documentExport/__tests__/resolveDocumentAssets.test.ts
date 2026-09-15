import { fetch } from 'expo/fetch';

import { inspectImage, MAX_ASSET_BYTES, resolveDocumentAssets } from '../resolveDocumentAssets';

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

test('an oversized declared decode produces a placeholder instead of entering the image cache', async () => {
  const oversized = png();
  new DataView(oversized.buffer).setUint32(16, 100_000);
  const cache = new Map();
  const result = await resolveDocumentAssets(
    new Map([['asset', { kind: 'managed-file', fileEntryId: 'file' }]]),
    cache,
    async () => oversized,
    new AbortController().signal,
  );
  expect(result.images.size).toBe(0);
  expect(result.issues).toHaveLength(1);
  expect(cache.size).toBe(0);
});

test('remote streams stop at the encoded-byte cap without reading the remaining body', async () => {
  const read = jest
    .fn()
    .mockResolvedValueOnce({ done: false, value: new Uint8Array(MAX_ASSET_BYTES + 1) });
  const cancel = jest.fn(async () => {});
  jest.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    headers: { get: () => null },
    body: { getReader: () => ({ read, cancel }) },
  } as never);
  const result = await resolveDocumentAssets(
    new Map([['remote', { kind: 'remote-image', url: 'https://example.com/photo.png' }]]),
    new Map(),
    jest.fn(),
    new AbortController().signal,
  );
  expect(result.issues).toHaveLength(1);
  expect(read).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    'https://example.com/photo.png',
    expect.objectContaining({ credentials: 'omit', redirect: 'error' }),
  );
});
