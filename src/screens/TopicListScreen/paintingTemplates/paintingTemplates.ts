import type { ImageProps } from 'expo-image';

import type { PaintingDraftHandoff } from '@/screens/PaintingScreen/utils/paintingDraftHandoff';

export type PaintingTemplate = Readonly<{
  author?: string;
  id: string;
  preview: ImageProps['source'];
  promptKey: string;
  title: string;
}>;

export const paintingTemplates: readonly PaintingTemplate[] = [
  {
    author: '@0x00_Krypt',
    id: 'china-landmark-diorama',
    preview: require('../../../../assets/paintings/templates/china-landmark-diorama.webp'),
    promptKey: 'painting.templates.prompt.landmark',
    title: 'China Landmark Diorama',
  },
  {
    author: '@wory37303852',
    id: 'meta-quest-3-exploded-view',
    preview: require('../../../../assets/paintings/templates/meta-quest-3-exploded-view.webp'),
    promptKey: 'painting.templates.prompt.quest',
    title: 'Meta Quest 3 Exploded View',
  },
  {
    author: '@rovvmut_',
    id: 'crocs-editorial-poster',
    preview: require('../../../../assets/paintings/templates/crocs-editorial-poster.webp'),
    promptKey: 'painting.templates.prompt.crocs',
    title: 'Crocs Editorial Poster',
  },
  {
    author: '@iamaiistudio',
    id: 'algorithm-fog-city-poster',
    preview: require('../../../../assets/paintings/templates/algorithm-fog-city-poster.webp'),
    promptKey: 'painting.templates.prompt.algorithm',
    title: 'Algorithm: Fog City',
  },
  {
    author: '@aimikoda',
    id: 'cyber-rabbit-character',
    preview: require('../../../../assets/paintings/templates/cyber-rabbit-character.webp'),
    promptKey: 'painting.templates.prompt.cyberRabbit',
    title: 'Cyber Rabbit Character',
  },
];

export function toPaintingTemplateDraft(
  template: PaintingTemplate,
  translate: (key: string) => string,
): PaintingDraftHandoff {
  return {
    attachments: [],
    draft: translate(template.promptKey),
  };
}
