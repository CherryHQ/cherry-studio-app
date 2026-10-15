import type { TFunction } from 'i18next';

import { fitPaintingImage, preparePaintingAnnotationPrompts } from '../paintingAnnotations';

describe('painting annotation coordinates', () => {
  it('fits the original image inside a different output frame without including letterbox space', () => {
    const target = fitPaintingImage(400, 600, 3 / 4);
    const image = fitPaintingImage(target.width, target.height, 2);
    expect(target).toEqual({
      width: 400,
      height: 400 / 0.75,
      left: 0,
      top: (600 - 400 / 0.75) / 2,
    });
    expect(image).toEqual({ width: 400, height: 200, left: 0, top: (target.height - 200) / 2 });
    expect(image.width / 2).toBe(200);
    expect(image.height / 2).toBe(100);
  });

  it('serializes only written notes using coordinates relative to the original reference', () => {
    const t = ((key: string, values?: Record<string, unknown>) =>
      key.endsWith('annotationGuide')
        ? 'Original image coordinates'
        : key.endsWith('annotationSummary')
          ? `Note ${values?.number}: ${values?.instruction}`
          : `${values?.number}: ${values?.x}%, ${values?.y}% — ${values?.instruction}`) as TFunction;
    const annotations = [
      { id: 1, x: 0.25, y: 0.4, text: ' Soften the edge ' },
      { id: 2, x: 0.5, y: 0.5, text: ' ' },
    ];
    expect(preparePaintingAnnotationPrompts(t, 'Keep the subject', annotations)).toEqual({
      prompt: 'Keep the subject\nOriginal image coordinates\n1: 25%, 40% — Soften the edge',
      displayPrompt: 'Keep the subject\nNote 1: Soften the edge',
    });
    expect(annotations[0].text).toBe(' Soften the edge ');
    expect(preparePaintingAnnotationPrompts(t, 'Keep this exact prompt', [])).toEqual({
      prompt: 'Keep this exact prompt',
      displayPrompt: 'Keep this exact prompt',
    });
  });
});
