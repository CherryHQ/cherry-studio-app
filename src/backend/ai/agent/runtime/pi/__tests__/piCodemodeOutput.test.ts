import { MAX_TEXT_ATTACHMENT_BYTES } from '@/shared/utils/fileAttachmentPolicy';

import { fitPiCodemodeOutput } from '../piCodemodeOutput';

const bytes = (text: string) => new TextEncoder().encode(text).byteLength;

test('output that read_file can read back is saved whole', () => {
  const ascii = 'x'.repeat(MAX_TEXT_ATTACHMENT_BYTES);
  expect(fitPiCodemodeOutput(ascii)).toBe(ascii);
  const image = new Uint8Array(MAX_TEXT_ATTACHMENT_BYTES + 1);
  expect(fitPiCodemodeOutput(image)).toBe(image);
});

test.each([
  ['ascii', 'x'.repeat(MAX_TEXT_ATTACHMENT_BYTES + 1)],
  // Three-byte characters followed by surrogate pairs, so the cut lands inside a pair.
  ['unicode', '中'.repeat(Math.floor(MAX_TEXT_ATTACHMENT_BYTES / 3) - 200) + '🍒'.repeat(400_000)],
])('oversized %s output keeps a readable start and says it was cut', (_kind, text) => {
  const saved = fitPiCodemodeOutput(text) as string;
  expect(bytes(saved)).toBeLessThanOrEqual(MAX_TEXT_ATTACHMENT_BYTES);
  const [kept, note] = saved.split('\n[Saved output cut: ');
  expect(text.startsWith(kept!)).toBe(true);
  expect(note).toContain(`of ${text.length} characters`);
  // A split surrogate pair would encode as a replacement character.
  expect(saved).not.toContain('�');
  expect(/[\uD800-\uDBFF]$/.test(kept!)).toBe(false);
});
