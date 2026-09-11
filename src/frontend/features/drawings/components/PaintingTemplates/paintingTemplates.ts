import type { ImageProps } from 'expo-image';

import catalog from '../../../../../../assets/paintings/templates/catalog.json';
import englishTemplates from '../../../../../../assets/paintings/templates/locales/en-us.json';
import chineseTemplates from '../../../../../../assets/paintings/templates/locales/zh-cn.json';

type PaintingTemplateId = keyof typeof englishTemplates;

export type PaintingTemplate = Readonly<{
  aspectRatio?: `${number}:${number}`;
  id: PaintingTemplateId;
  preview: ImageProps['source'];
  prompt: string;
  isReferenceImageRequired: boolean;
  title: string;
}>;

// Mobile-owned generation requirements, independent of the localized desktop prompts.
const TEMPLATE_REQUIREMENTS: Partial<
  Record<
    PaintingTemplateId,
    Partial<Pick<PaintingTemplate, 'aspectRatio' | 'isReferenceImageRequired'>>
  >
> = {
  'human-fragments-motion': { aspectRatio: '9:16' },
  'human-fragments-sport': { aspectRatio: '9:16' },
  'underwater-editorial': { aspectRatio: '9:16' },
  'wuxia-swordswoman': { aspectRatio: '9:16' },
  'literary-art-poster': { aspectRatio: '9:16' },
  'tuscan-residence': { aspectRatio: '4:5' },
  'summer-hillside': { aspectRatio: '9:16' },
  'slow-shutter-fashion': { aspectRatio: '9:16' },
  'circular-cutout': { aspectRatio: '3:4' },
  'doodle-shadow': { isReferenceImageRequired: true },
  'birthday-poster': { aspectRatio: '3:4' },
};

const previews = {
  'human-fragments-motion': require('../../../../../../assets/paintings/templates/human-fragments-motion.webp'),
  'human-fragments-sport': require('../../../../../../assets/paintings/templates/human-fragments-sport.webp'),
  'laundromat-dance': require('../../../../../../assets/paintings/templates/laundromat-dance.webp'),
  'underwater-editorial': require('../../../../../../assets/paintings/templates/underwater-editorial.webp'),
  'wuxia-swordswoman': require('../../../../../../assets/paintings/templates/wuxia-swordswoman.webp'),
  'literary-art-poster': require('../../../../../../assets/paintings/templates/literary-art-poster.webp'),
  'tuscan-residence': require('../../../../../../assets/paintings/templates/tuscan-residence.webp'),
  'summer-hillside': require('../../../../../../assets/paintings/templates/summer-hillside.webp'),
  'slow-shutter-fashion': require('../../../../../../assets/paintings/templates/slow-shutter-fashion.webp'),
  'crocs-campaign': require('../../../../../../assets/paintings/templates/crocs-campaign.webp'),
  'tennis-collage': require('../../../../../../assets/paintings/templates/tennis-collage.webp'),
  'deadpan-cat': require('../../../../../../assets/paintings/templates/deadpan-cat.webp'),
  'monochrome-suit': require('../../../../../../assets/paintings/templates/monochrome-suit.webp'),
  'circular-cutout': require('../../../../../../assets/paintings/templates/circular-cutout.webp'),
  'travel-journal': require('../../../../../../assets/paintings/templates/travel-journal.webp'),
  'wedding-invitation': require('../../../../../../assets/paintings/templates/wedding-invitation.webp'),
  'storyboard-sketch': require('../../../../../../assets/paintings/templates/storyboard-sketch.webp'),
  'anime-companion': require('../../../../../../assets/paintings/templates/anime-companion.webp'),
  'doodle-shadow': require('../../../../../../assets/paintings/templates/doodle-shadow.webp'),
  'y2k-street': require('../../../../../../assets/paintings/templates/y2k-street.webp'),
  'birthday-poster': require('../../../../../../assets/paintings/templates/birthday-poster.webp'),
  'light-trails': require('../../../../../../assets/paintings/templates/light-trails.webp'),
  'anime-companion-variant': require('../../../../../../assets/paintings/templates/anime-companion-variant.webp'),
  'train-window': require('../../../../../../assets/paintings/templates/train-window.webp'),
  'low-angle-fashion': require('../../../../../../assets/paintings/templates/low-angle-fashion.webp'),
} satisfies Record<PaintingTemplateId, ImageProps['source']>;

const variablePattern = /\$\{([^{}\r\n]+)\}/g;

export function getPaintingTemplates(language: string): PaintingTemplate[] {
  const isChinese = language.toLowerCase() === 'zh-cn';
  const translations = isChinese ? chineseTemplates : englishTemplates;

  return catalog.map((catalogId) => {
    const id = catalogId as PaintingTemplateId;
    const { label, prompt } = translations[id];
    return {
      aspectRatio: TEMPLATE_REQUIREMENTS[id]?.aspectRatio,
      id,
      preview: previews[id],
      prompt,
      isReferenceImageRequired: TEMPLATE_REQUIREMENTS[id]?.isReferenceImageRequired ?? false,
      title: label,
    };
  });
}

export function shufflePaintingTemplates(
  templates: readonly PaintingTemplate[],
): PaintingTemplate[] {
  const shuffled = [...templates];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

export function createPaintingTemplatePrompt(template: PaintingTemplate): string {
  return template.prompt
    .replace(variablePattern, (_match, defaultValue: string) => defaultValue.trim())
    .trim();
}

export function isPaintingTemplateInputValid(
  template: PaintingTemplate,
  prompt: string,
  referenceImageCount: number,
): boolean {
  return (
    (!template.isReferenceImageRequired || referenceImageCount > 0) && prompt.trim().length > 0
  );
}
