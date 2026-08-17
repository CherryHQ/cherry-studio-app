const HANGUL_CHARACTER = /\p{Script=Hangul}/u;
const KANA_CHARACTER = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

export function resolveAssistantReadAloudLanguage(
  text: string,
  explicitLanguage?: string,
): string | undefined {
  if (explicitLanguage) {
    return explicitLanguage;
  }

  const hasHangul = HANGUL_CHARACTER.test(text);
  const hasKana = KANA_CHARACTER.test(text);

  if (hasHangul && !hasKana) {
    return 'ko-KR';
  }
  if (hasKana && !hasHangul) {
    return 'ja-JP';
  }

  return undefined;
}
