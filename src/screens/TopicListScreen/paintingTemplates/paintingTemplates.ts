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
    id: 'tokyo-map-diorama',
    preview: require('../../../../assets/paintings/templates/tokyo-map-diorama.webp'),
    prompt: '',
    title: 'Tokyo Map Diorama',
  },
  {
    id: 'meta-quest-3-exploded-view',
    preview: require('../../../../assets/paintings/templates/meta-quest-3-exploded-view.webp'),
    prompt: '',
    title: 'Meta Quest 3 Exploded View',
  },
  {
    id: 'crocs-editorial-poster',
    preview: require('../../../../assets/paintings/templates/crocs-editorial-poster.webp'),
    prompt: '',
    title: 'Crocs Editorial Poster',
  },
  {
    id: 'algorithm-fog-city-poster',
    preview: require('../../../../assets/paintings/templates/algorithm-fog-city-poster.webp'),
    prompt: '',
    title: 'Algorithm: Fog City',
  },
  {
    id: 'china-landmark-diorama',
    preview: require('../../../../assets/paintings/templates/china-landmark-diorama.webp'),
    prompt: '',
    title: 'China Landmark Diorama',
  },
  {
    id: 'cyber-rabbit-character',
    preview: require('../../../../assets/paintings/templates/cyber-rabbit-character.webp'),
    prompt: '',
    title: 'Cyber Rabbit Character',
  },
];

export function toPaintingTemplateDraft(template: PaintingTemplate): PaintingDraftHandoff {
  return {
    attachments: [],
    draft: template.prompt,
  };
}
