import { nativeSystemEntrySchema } from '../entrySchema';

const base = {
  version: 1,
  id: '23f54a2f-eaeb-4c89-9a03-31a09efb79fb',
  createdAt: 1_789_566_000_000,
};

test('shares reject fields outside the bounded native envelope', () => {
  const share = { ...base, kind: 'share.receive', text: 'hello', files: [] };
  expect(nativeSystemEntrySchema.safeParse(share).success).toBe(true);
  expect(nativeSystemEntrySchema.safeParse({ ...share, replyExpected: true }).success).toBe(false);
  expect(
    nativeSystemEntrySchema.safeParse({ ...share, endpoint: 'https://example.com' }).success,
  ).toBe(false);
});

test('rejects unknown actions, versions, unbounded payloads, and arbitrary source URIs', () => {
  expect(
    nativeSystemEntrySchema.safeParse({ ...base, kind: 'tool.run', tool: 'calendar.delete' })
      .success,
  ).toBe(false);
  expect(
    nativeSystemEntrySchema.safeParse({ ...base, version: 2, kind: 'system.open' }).success,
  ).toBe(false);
  expect(
    nativeSystemEntrySchema.safeParse({
      ...base,
      kind: 'share.receive',
      text: 'x'.repeat(131_073),
      files: [],
    }).success,
  ).toBe(false);
  expect(
    nativeSystemEntrySchema.safeParse({
      ...base,
      kind: 'share.receive',
      text: '',
      files: [
        {
          uri: 'https://example.com/private',
          name: 'file',
          mediaType: 'text/plain',
          size: 1,
        },
      ],
    }).success,
  ).toBe(false);
});

test('rejects empty shares and aggregate attachment sizes above the native staging limit', () => {
  expect(
    nativeSystemEntrySchema.safeParse({ ...base, kind: 'share.receive', text: ' ', files: [] })
      .success,
  ).toBe(false);
  const attachment = {
    uri: 'file:///private/staged/file',
    name: 'file',
    mediaType: 'image/png',
    size: 25 * 1024 * 1024,
  };
  expect(
    nativeSystemEntrySchema.safeParse({
      ...base,
      kind: 'share.receive',
      text: '',
      files: [attachment, attachment],
    }).success,
  ).toBe(true);
  expect(
    nativeSystemEntrySchema.safeParse({
      ...base,
      kind: 'share.receive',
      text: '',
      files: [attachment, attachment, attachment],
    }).success,
  ).toBe(false);
});
