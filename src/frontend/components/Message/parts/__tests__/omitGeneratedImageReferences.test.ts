import type { CherryMessagePart } from '@/shared/data/types/message';

import { omitGeneratedImageReferences } from '../omitGeneratedImageReferences';

const id = '01a0c213-4cfb-741d-807e-624fedfa1ab8';
const url = `https://preview.cherry.ai/${id}`;
const image: CherryMessagePart = {
  type: 'file',
  mediaType: 'image/png',
  url: `cherry://file/${id}`,
  providerMetadata: { cherry: { fileEntryId: id } },
};
const reference = `![三国名将阵营图](${url})`;

test('removes the duplicate preview URL while preserving the image, explanation, and stored text', () => {
  const explanation = '这张图将三国名将按 **蜀汉 / 曹魏 / 东吴 + 吕布** 四大板块布局。';
  const answer = { type: 'text', text: `${reference}\n\n${explanation}` } as const;
  const parts = [image, answer];

  const result = omitGeneratedImageReferences(parts);

  expect(result).toEqual([image, { ...answer, text: explanation }]);
  expect(result[0]).toBe(image);
  expect(parts[1]).toBe(answer);
  expect(answer.text).toBe(`${reference}\n\n${explanation}`);
});

test('leaves unrelated remote images and references to other files untouched', () => {
  const parts: CherryMessagePart[] = [
    image,
    {
      type: 'text',
      text: `![unrelated](https://example.com/${id}-other)\n\n![photo](https://example.com/photo.png)`,
    },
  ];
  expect(omitGeneratedImageReferences(parts)).toBe(parts);
  expect(omitGeneratedImageReferences([{ type: 'text', text: reference }])).toEqual([
    { type: 'text', text: reference },
  ]);
});

test.each([
  `\`${reference}\``,
  `\`\`\`markdown\n${reference}\n\`\`\``,
  `~~~markdown\n${reference}\n~~~`,
  `    ${reference}`,
  `Here is ${reference} with a caption.`,
  `> ${reference}`,
])('preserves code examples, inline prose, and nested blocks: %s', (text) => {
  const parts: CherryMessagePart[] = [image, { type: 'text', text }];
  expect(omitGeneratedImageReferences(parts)).toBe(parts);
});

test('handles Markdown titles and reference-style images without rewriting other blocks', () => {
  const parts: CherryMessagePart[] = [
    image,
    {
      type: 'text',
      text: `![title](<${url}> "generated")\n\n${reference}\n\n![chart][result]\n\nText\n\n[result]: ${url}`,
    },
  ];
  expect(omitGeneratedImageReferences(parts)[1]).toEqual({
    type: 'text',
    text: `Text\n\n[result]: ${url}`,
  });
});

test('removes an image-only text part without losing the managed image result', () => {
  expect(omitGeneratedImageReferences([image, { type: 'text', text: reference }])).toEqual([
    image,
    { type: 'text', text: '' },
  ]);
});
