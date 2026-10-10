import { EditFileImageInputSchema } from '../fileImageEdit';

const edit = {
  fileEntryId: '00000000-0000-4000-8000-000000000001',
  rotation: 90,
  crop: { x: 0.25, y: 0.1, width: 0.5, height: 0.8 },
};

test('accepts a bounded normalized crop and a quarter-turn rotation', () => {
  expect(EditFileImageInputSchema.parse(edit)).toEqual(edit);
});

test.each([
  { ...edit, rotation: 45 },
  { ...edit, fileEntryId: 'file:///private/photo.jpg' },
  { ...edit, crop: { ...edit.crop, width: 0 } },
  { ...edit, crop: { ...edit.crop, x: -0.01 } },
  { ...edit, crop: { ...edit.crop, width: 0.9 } },
  { ...edit, crop: { ...edit.crop, height: Infinity } },
])('rejects invalid edits before a pixel write: %j', (input) => {
  expect(EditFileImageInputSchema.safeParse(input).success).toBe(false);
});
