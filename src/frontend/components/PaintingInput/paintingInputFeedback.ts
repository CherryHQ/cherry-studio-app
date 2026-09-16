import type { TFunction } from 'i18next';

import type { PaintingGenerationIssue } from '@/shared/utils/paintingGenerationStrategy';

const issueKeys = {
  'model-unavailable': 'painting.input.modelUnavailable',
  'image-required': 'painting.input.referenceRequired',
  'images-unsupported': 'painting.input.imagesUnsupported',
  'prompt-required': 'painting.input.promptRequired',
  'invalid-parameters': 'painting.input.invalidParameters',
  'mode-changed': 'painting.input.incompatibleModel',
} as const;

export function paintingInputIssueLabel(t: TFunction, issue: PaintingGenerationIssue): string {
  return issue.code === 'too-many-images'
    ? t('painting.input.tooManyImages', { count: issue.limit })
    : t(issueKeys[issue.code]);
}
