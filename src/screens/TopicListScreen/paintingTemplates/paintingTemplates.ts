import type { ImageProps } from 'expo-image';

import type { PaintingDraftHandoff } from '@/screens/PaintingScreen/utils/paintingDraftHandoff';

export type PaintingTemplate = Readonly<{
  author?: string;
  id: string;
  preview: ImageProps['source'];
  prompt: string;
  title: string;
}>;

export const paintingTemplates: readonly PaintingTemplate[] = [
  {
    id: 'cherry-twilight',
    preview: require('../../../../assets/paintings/templates/cherry-twilight.png'),
    prompt:
      'A luminous glass teahouse under blooming cherry trees at blue hour, a glossy red teapot on a stone table, cinematic editorial 3D illustration, soft lantern light, crisp details, portrait composition, no text, no watermark.',
    title: 'Cherry Twilight',
  },
];

export function toPaintingTemplateDraft(template: PaintingTemplate): PaintingDraftHandoff {
  return {
    attachments: [],
    draft: template.prompt,
  };
}
