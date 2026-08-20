const HANGUL_CHARACTER = /\p{Script=Hangul}/u;
const KANA_CHARACTER = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const LETTER_CHARACTER = /\p{L}/u;
const MINIMUM_SCRIPT_CHARACTERS = 2;

export function resolveAssistantReadAloudLanguage(
  text: string,
  explicitLanguage?: string,
): string | undefined {
  if (explicitLanguage) {
    return explicitLanguage;
  }

  let hangulCount = 0;
  let kanaCount = 0;
  let letterCount = 0;
  for (const character of text) {
    if (LETTER_CHARACTER.test(character)) {
      letterCount += 1;
    }
    if (HANGUL_CHARACTER.test(character)) {
      hangulCount += 1;
    } else if (KANA_CHARACTER.test(character)) {
      kanaCount += 1;
    }
  }

  if (kanaCount === 0 && hasEnoughSignal(hangulCount, letterCount)) {
    return 'ko-KR';
  }
  if (hangulCount === 0 && hasEnoughSignal(kanaCount, letterCount)) {
    return 'ja-JP';
  }

  return undefined;
}

function hasEnoughSignal(scriptCount: number, letterCount: number): boolean {
  return scriptCount >= MINIMUM_SCRIPT_CHARACTERS && scriptCount * 2 >= letterCount;
}
