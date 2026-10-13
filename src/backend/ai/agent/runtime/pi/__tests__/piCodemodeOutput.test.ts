import { MAX_TEXT_ATTACHMENT_BYTES } from '@/shared/utils/fileAttachmentPolicy';

import type { RuntimeArtifact } from '../../types';
import { writePiCodemodeOutput } from '../piCodemodeOutput';

test.each(['ascii', 'unicode'])(
  'oversized %s output stays readable and reconstructs without loss',
  async (kind) => {
    const chunkCharacters = Math.floor(MAX_TEXT_ATTACHMENT_BYTES / 3);
    const text =
      kind === 'ascii'
        ? 'x'.repeat(MAX_TEXT_ATTACHMENT_BYTES + 1)
        : '中'.repeat(chunkCharacters - 1) + '🍒'.repeat(chunkCharacters);
    const files = new Map<string, string | Uint8Array>();
    const write = async (name: string, data: string | Uint8Array): Promise<RuntimeArtifact> => {
      files.set(name, data);
      return {
        name,
        ref: { kind: 'managed-file', fileEntryId: name },
        mediaType: 'text/plain',
        kind: 'created',
      };
    };
    const result = await writePiCodemodeOutput('output.txt', text, write);
    const chunks = [...files].filter(([name]) => name !== 'output.txt.index.txt');
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map(([, data]) => data).join('')).toBe(text);
    const encoder = new TextEncoder();
    for (const [name, chunk] of chunks) {
      expect(encoder.encode(chunk as string).byteLength).toBeLessThanOrEqual(
        MAX_TEXT_ATTACHMENT_BYTES,
      );
      expect(new TextDecoder().decode(encoder.encode(chunk as string))).toBe(chunk);
      expect(files.get('output.txt.index.txt')).toContain(`file_entry_id=${name}`);
    }
    expect(result.name).toBe('output.txt.index.txt');
    const names = [...files.keys()];
    await writePiCodemodeOutput('output.txt', text, write);
    expect([...files.keys()]).toEqual(names);
  },
);

test('small text and image bytes keep the original output file', async () => {
  const write = jest.fn(
    async (name: string): Promise<RuntimeArtifact> => ({
      name,
      ref: { kind: 'managed-file', fileEntryId: name },
      mediaType: 'text/plain',
      kind: 'created',
    }),
  );
  await writePiCodemodeOutput('output.txt', 'small', write);
  const image = new Uint8Array([137, 80, 78, 71]);
  await writePiCodemodeOutput('image.png', image, write);
  expect(write.mock.calls).toEqual([
    ['output.txt', 'small'],
    ['image.png', image],
  ]);
});
