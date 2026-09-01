const MINIMUM_FENCE_LENGTH = 3;
const SAFE_LANGUAGE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_+.#-]*$/;

/** Wrap code in a fence that cannot be closed by its content. */
export function createCodeBlockMarkdown(content: string, language?: string): string {
  const fence = '`'.repeat(longestBacktickRun(content) + 1);
  const safeFence = fence.length < MINIMUM_FENCE_LENGTH ? '```' : fence;
  const normalizedLanguage = normalizeCodeLanguage(language);
  const closingLineBreak = content.endsWith('\n') ? '' : '\n';

  return `${safeFence}${normalizedLanguage}\n${content}${closingLineBreak}${safeFence}`;
}

function longestBacktickRun(content: string): number {
  let longestRun = 0;
  let currentRun = 0;

  for (const character of content) {
    if (character === '`') {
      currentRun += 1;
      longestRun = Math.max(longestRun, currentRun);
    } else {
      currentRun = 0;
    }
  }

  return longestRun;
}

function normalizeCodeLanguage(language: string | undefined): string {
  const normalized = language?.trim() ?? '';
  return SAFE_LANGUAGE_PATTERN.test(normalized) ? normalized : '';
}
