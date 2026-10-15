import type { TFunction } from 'i18next';

export type PaintingAnnotation = { id: number; x: number; y: number; text: string };

/** Fit geometry is shared by the visible reference and the annotation hit target. */
export function fitPaintingImage(width: number, height: number, aspectRatio: number) {
  const fittedWidth = Math.min(width, height * aspectRatio);
  const fittedHeight = fittedWidth / aspectRatio;
  return {
    height: fittedHeight,
    left: (width - fittedWidth) / 2,
    top: (height - fittedHeight) / 2,
    width: fittedWidth,
  };
}

/** Coordinates describe the original image, never the viewport or a requested output frame. */
export function preparePaintingAnnotationPrompts(
  t: TFunction,
  prompt: string,
  annotations: readonly PaintingAnnotation[],
) {
  const instructions = annotations.filter((annotation) => annotation.text.trim().length > 0);
  if (instructions.length === 0) return { prompt, displayPrompt: prompt };
  const modelPrompt = [
    prompt.trim(),
    t('painting.editor.annotationGuide'),
    ...instructions.map((annotation) =>
      t('painting.editor.annotationInstruction', {
        number: annotation.id,
        x: Math.round(annotation.x * 100),
        y: Math.round(annotation.y * 100),
        instruction: annotation.text.trim(),
      }),
    ),
  ]
    .filter(Boolean)
    .join('\n');
  const displayPrompt = [
    prompt.trim(),
    ...instructions.map((annotation) =>
      t('painting.editor.annotationSummary', {
        number: annotation.id,
        instruction: annotation.text.trim(),
      }),
    ),
  ]
    .filter(Boolean)
    .join('\n');
  return { prompt: modelPrompt, displayPrompt };
}
