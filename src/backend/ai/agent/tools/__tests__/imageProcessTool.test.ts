import type { RgbaImage } from '@/backend/utils/rgbaImage';

import { createImageProcessTool } from '../imageProcessTool';

// Fake "encoded" bytes carry a JSON description of the pixels; the codec mock decodes them.
type Fake = { size: number; fill: number[]; patch?: number[] };
jest.mock('@/backend/services/file/rgbaImageCodec', () => ({
  decodeRgba: (bytes: Uint8Array, square?: number): RgbaImage => {
    const fake = JSON.parse(new TextDecoder().decode(bytes)) as Fake;
    const size = square ?? fake.size;
    const data = new Uint8Array(size * size * 4);
    for (let p = 0; p < size * size; p++) data.set(fake.fill, p * 4);
    if (fake.patch) {
      const [x0, y0, x1, y1, ...rgba] = fake.patch;
      for (let y = y0!; y <= y1!; y++)
        for (let x = x0!; x <= x1!; x++) data.set(rgba, (y * size + x) * 4);
    }
    return { width: size, height: size, data };
  },
  encodePng: () => new Uint8Array([1, 2, 3]),
}));

const ids = {
  base: '00000000-0000-4000-8000-000000000001',
  edit: '00000000-0000-4000-8000-000000000002',
  small: '00000000-0000-4000-8000-000000000003',
  foreign: '00000000-0000-4000-8000-000000000004',
};
const images: Record<string, Fake> = {
  [ids.base]: { size: 32, fill: [0, 255, 0, 255], patch: [8, 8, 23, 23, 250, 200, 180, 255] },
  [ids.edit]: { size: 32, fill: [0, 255, 0, 255], patch: [12, 14, 19, 16, 10, 10, 10, 255] },
  [ids.small]: { size: 16, fill: [0, 0, 0, 255] },
};
const created: string[] = [];
const files = {
  resolveAvailable: jest.fn(async (list: readonly string[]) => {
    const found = list.filter((id) => images[id]);
    return new Map(
      found.map((id) => [
        id,
        { fileEntryId: id, mediaType: 'image/png', name: 'face.png', size: 10 },
      ]),
    );
  }),
  readAsBytes: jest.fn(async (fact: { fileEntryId: string }) =>
    new TextEncoder().encode(JSON.stringify(images[fact.fileEntryId])),
  ),
  readImage: jest.fn(async () => ({ data: 'cHJldmlldw==', mediaType: 'image/png' })),
  createInternalEntry: jest.fn(async (input: { name: string }) => {
    created.push(input.name);
    return {
      id: '00000000-0000-4000-8000-0000000000ff',
      filename: input.name,
      mediaType: 'image/png',
      size: 3,
    } as never;
  }),
};
const scope = { fileEntryIds: new Set([ids.base, ids.edit, ids.small]) } as never;
const run = (input: object) =>
  createImageProcessTool(files as never, scope).execute({
    input: input as never,
    signal: new AbortController().signal,
    toolCallId: 'call',
    turnId: 'turn',
  });

beforeEach(() => {
  created.length = 0;
});

test('remove_background saves a derived PNG and shows it to the model', async () => {
  const result = await run({ operation: 'remove_background', file_entry_id: ids.base });
  expect(result.value).toMatchObject({
    status: 'ok',
    subjectBounds: { left: 8, top: 8, right: 23, bottom: 23 },
  });
  expect(created).toEqual(['face-remove-background.png']);
  expect(result.artifacts[0]).toMatchObject({ kind: 'derived', mediaType: 'image/png' });
  expect(result.modelImages).toHaveLength(1);
});

test('measure compares two frames without writing a file', async () => {
  const result = await run({
    operation: 'measure',
    file_entry_id: ids.base,
    other_file_entry_id: ids.edit,
  });
  expect(result.value).toMatchObject({ status: 'ok', changedBounds: { left: 8, top: 8 } });
  expect(created).toEqual([]);
});

test.each([
  [{ operation: 'transplant', file_entry_id: ids.base }, 'needs `other_file_entry_id`'],
  [
    { operation: 'measure', file_entry_id: ids.base, other_file_entry_id: ids.small },
    'same pixel size',
  ],
  [{ operation: 'resize', file_entry_id: ids.foreign, size: 64 }, 'not part of this conversation'],
])('rejects %o with a message the model can act on', async (input, message) => {
  const result = await run(input);
  expect(result.value).toMatchObject({ status: 'error' });
  expect(JSON.stringify(result.value)).toContain(message);
});
