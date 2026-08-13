const HAN_CHARACTER = /\p{Script=Han}/u;
const HANGUL_CHARACTER = /\p{Script=Hangul}/u;
const KANA_CHARACTER = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const LATIN_CHARACTER = /\p{Script=Latin}/u;

export function resolveAssistantReadAloudLanguage(
  text: string,
  explicitLanguage?: string,
): string | undefined {
  if (explicitLanguage) {
    return explicitLanguage;
  }

  let han = 0;
  let hangul = 0;
  let kana = 0;
  let latin = 0;

  for (const character of text) {
    if (HAN_CHARACTER.test(character)) {
      han += 1;
    } else if (HANGUL_CHARACTER.test(character)) {
      hangul += 1;
    } else if (KANA_CHARACTER.test(character)) {
      kana += 1;
    } else if (LATIN_CHARACTER.test(character)) {
      latin += 1;
    }
  }

  if (hangul > 0 && kana === 0) {
    return 'ko-KR';
  }
  if (kana > 0 && hangul === 0) {
    return 'ja-JP';
  }
  if (hangul > 0 && kana > 0) {
    return undefined;
  }

  const comparable = han + latin;
  if (comparable === 0) {
    return undefined;
  }
  if (han / comparable >= 0.6) {
    return 'zh-CN';
  }
  if (latin >= 4 && latin / comparable >= 0.6) {
    return 'en-US';
  }

  return undefined;
}
