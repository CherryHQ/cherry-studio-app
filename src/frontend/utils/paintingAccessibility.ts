import type { TFunction } from 'i18next';

const PAINTING_PROMPT_SUMMARY_MAX_CHARACTERS = 80;

export function paintingOutputAccessibilityLabel(
  t: TFunction,
  {
    count,
    index,
    prompt,
  }: {
    count: number;
    index: number;
    prompt: string;
  },
): string {
  const normalizedPrompt = prompt.replace(/\s+/g, ' ').trim();
  if (normalizedPrompt.length === 0) {
    return t('painting.outputAccessibilityWithoutPrompt', { count, index });
  }

  const characters = Array.from(normalizedPrompt);
  const promptSummary =
    characters.length <= PAINTING_PROMPT_SUMMARY_MAX_CHARACTERS
      ? normalizedPrompt
      : `${characters
          .slice(0, PAINTING_PROMPT_SUMMARY_MAX_CHARACTERS - 1)
          .join('')
          .trimEnd()}…`;

  return t('painting.outputAccessibility', { count, index, prompt: promptSummary });
}
