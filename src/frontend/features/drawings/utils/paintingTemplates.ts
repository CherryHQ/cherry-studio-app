import type { ImageProps } from 'expo-image';

import catalog from '@/assets/paintings/templates/catalog.json';
import englishTemplates from '@/assets/paintings/templates/locales/en-us.json';
import chineseTemplates from '@/assets/paintings/templates/locales/zh-cn.json';
import presentation from '@/assets/paintings/templates/presentation.json';

type PaintingTemplateId = keyof typeof englishTemplates;
type PromptLanguage = 'en-us' | 'zh-cn';

export const PAINTING_TEMPLATE_CATEGORIES = [
  'portrait',
  'poster',
  'cute',
  'illustration',
  'space',
] as const;
export type PaintingTemplateCategory = (typeof PAINTING_TEMPLATE_CATEGORIES)[number];

/** One `${default}` value in the prompt, in prompt order, with the label written before it. */
export type PaintingTemplateSlot = Readonly<{
  defaultValue: string;
  label?: string;
  /** Order in the prompt; the slot's identity, since a template never reorders. */
  position: number;
}>;

export type PaintingTemplate = Readonly<{
  category: PaintingTemplateCategory;
  id: string;
  /**
   * How a reference photo joins the request: it stands in for one slot's
   * subject, or the prompt already asks for an uploaded photo.
   */
  photo?: Readonly<{ isRequired: boolean; slotIndex?: number }>;
  preview: ImageProps['source'];
  prompt: string;
  promptLanguage: PromptLanguage;
  slots: readonly PaintingTemplateSlot[];
  summary: string;
  title: string;
}>;

const previews = {
  'human-fragments-motion': require('@/assets/paintings/templates/human-fragments-motion.webp'),
  'human-fragments-sport': require('@/assets/paintings/templates/human-fragments-sport.webp'),
  'laundromat-dance': require('@/assets/paintings/templates/laundromat-dance.webp'),
  'underwater-editorial': require('@/assets/paintings/templates/underwater-editorial.webp'),
  'wuxia-swordswoman': require('@/assets/paintings/templates/wuxia-swordswoman.webp'),
  'literary-art-poster': require('@/assets/paintings/templates/literary-art-poster.webp'),
  'tuscan-residence': require('@/assets/paintings/templates/tuscan-residence.webp'),
  'summer-hillside': require('@/assets/paintings/templates/summer-hillside.webp'),
  'slow-shutter-fashion': require('@/assets/paintings/templates/slow-shutter-fashion.webp'),
  'crocs-campaign': require('@/assets/paintings/templates/crocs-campaign.webp'),
  'tennis-collage': require('@/assets/paintings/templates/tennis-collage.webp'),
  'deadpan-cat': require('@/assets/paintings/templates/deadpan-cat.webp'),
  'monochrome-suit': require('@/assets/paintings/templates/monochrome-suit.webp'),
  'circular-cutout': require('@/assets/paintings/templates/circular-cutout.webp'),
  'travel-journal': require('@/assets/paintings/templates/travel-journal.webp'),
  'wedding-invitation': require('@/assets/paintings/templates/wedding-invitation.webp'),
  'storyboard-sketch': require('@/assets/paintings/templates/storyboard-sketch.webp'),
  'anime-companion': require('@/assets/paintings/templates/anime-companion.webp'),
  'doodle-shadow': require('@/assets/paintings/templates/doodle-shadow.webp'),
  'y2k-street': require('@/assets/paintings/templates/y2k-street.webp'),
  'birthday-poster': require('@/assets/paintings/templates/birthday-poster.webp'),
  'light-trails': require('@/assets/paintings/templates/light-trails.webp'),
  'anime-companion-variant': require('@/assets/paintings/templates/anime-companion-variant.webp'),
  'train-window': require('@/assets/paintings/templates/train-window.webp'),
  'low-angle-fashion': require('@/assets/paintings/templates/low-angle-fashion.webp'),
} satisfies Record<PaintingTemplateId, ImageProps['source']>;

type TemplatePresentation = {
  category: PaintingTemplateCategory;
  photoSlot?: number;
  requiresPhoto?: boolean;
  summary: Record<PromptLanguage, string>;
};

const presentations = presentation as Record<PaintingTemplateId, TemplatePresentation>;

/** Replaces a photo-backed slot; written in the prompt's own language, like the template. */
const photoSubjectPrompts: Record<PromptLanguage, string> = {
  'en-us': 'the subject from the reference photo, keeping their appearance',
  'zh-cn': '参考照片中的主体，保持其外貌特征',
};

const variablePattern = /\$\{([^{}\r\n]+)\}/g;
const labelPattern = /([^\n.。;；,，:：{}]{1,24})[:：]\s*$/;

/** Async resource boundary: replace the local read here when templates move to HTTP. */
export async function getPaintingTemplates(
  language: string,
  signal?: AbortSignal,
): Promise<PaintingTemplate[]> {
  signal?.throwIfAborted();
  const promptLanguage: PromptLanguage = language.toLowerCase() === 'zh-cn' ? 'zh-cn' : 'en-us';
  const translations = promptLanguage === 'zh-cn' ? chineseTemplates : englishTemplates;

  return catalog.map((catalogId) => {
    const id = catalogId as PaintingTemplateId;
    const { label, prompt } = translations[id];
    const { category, photoSlot, requiresPhoto, summary } = presentations[id];
    return {
      category,
      id,
      ...(photoSlot !== undefined || requiresPhoto
        ? { photo: { isRequired: requiresPhoto === true, slotIndex: photoSlot } }
        : {}),
      preview: previews[id],
      prompt,
      promptLanguage,
      slots: parsePaintingTemplateSlots(prompt),
      summary: summary[promptLanguage],
      title: label,
    };
  });
}

/** Each `${…}` in prompt order; a label is kept when a short `Label:` phrase introduces it. */
export function parsePaintingTemplateSlots(prompt: string): PaintingTemplateSlot[] {
  const slots: PaintingTemplateSlot[] = [];
  let previousEnd = 0;
  for (const match of prompt.matchAll(variablePattern)) {
    const label = labelPattern.exec(prompt.slice(previousEnd, match.index))?.[1]?.trim();
    slots.push({
      defaultValue: match[1].trim(),
      ...(label ? { label } : {}),
      position: slots.length,
    });
    previousEnd = match.index + match[0].length;
  }
  return slots;
}

/**
 * The prompt the model receives: each slot takes the user's value (blank keeps
 * the default), and with a photo attached its slot names the photo's subject.
 * The bundled template never changes.
 */
export function materializePaintingTemplatePrompt(
  template: PaintingTemplate,
  values: readonly string[],
  { hasPhoto }: { hasPhoto: boolean },
): string {
  let index = 0;
  return template.prompt
    .replace(variablePattern, (_match, defaultValue: string) => {
      const slotIndex = index;
      index += 1;
      if (hasPhoto && template.photo?.slotIndex === slotIndex) {
        return photoSubjectPrompts[template.promptLanguage];
      }
      return values[slotIndex]?.trim() || defaultValue.trim();
    })
    .trim();
}
