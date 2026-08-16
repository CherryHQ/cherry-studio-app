type DelimiterCharacter = '*' | '_' | '~';

type InlineToken =
  | { type: 'text'; value: string }
  | {
      canClose: boolean;
      canOpen: boolean;
      character: DelimiterCharacter;
      remaining: number;
      type: 'delimiter';
    };

const DELIMITER_CHARACTER = /[*_~]/u;
const PUNCTUATION_CHARACTER = /[\p{P}\p{S}]/u;
const WHITESPACE_CHARACTER = /\s/u;

export function projectMarkdownInlineForSpeech(markdown: string): string {
  const tokens = tokenizeInlineDelimiters(markdown);
  pairInlineDelimiters(tokens);

  return tokens
    .map((token) => (token.type === 'text' ? token.value : token.character.repeat(token.remaining)))
    .join('');
}

function tokenizeInlineDelimiters(markdown: string): InlineToken[] {
  const characters = Array.from(markdown);
  const tokens: InlineToken[] = [];

  for (let index = 0; index < characters.length;) {
    const character = characters[index];
    const escapedCharacter = characters[index + 1];
    if (character === '\\' && isDelimiterCharacter(escapedCharacter)) {
      tokens.push({ type: 'text', value: escapedCharacter });
      index += 2;
      continue;
    }

    if (!isDelimiterCharacter(character)) {
      tokens.push({ type: 'text', value: character });
      index += 1;
      continue;
    }

    let end = index + 1;
    while (characters[end] === character) {
      end += 1;
    }

    const length = end - index;
    if (character === '~' && length !== 2) {
      tokens.push({ type: 'text', value: character.repeat(length) });
      index = end;
      continue;
    }

    const leftCharacter = characters[index - 1];
    const rightCharacter = characters[end];
    const leftIsWhitespace =
      leftCharacter === undefined || WHITESPACE_CHARACTER.test(leftCharacter);
    const rightIsWhitespace =
      rightCharacter === undefined || WHITESPACE_CHARACTER.test(rightCharacter);
    const leftIsPunctuation =
      leftCharacter !== undefined && PUNCTUATION_CHARACTER.test(leftCharacter);
    const rightIsPunctuation =
      rightCharacter !== undefined && PUNCTUATION_CHARACTER.test(rightCharacter);
    const isLeftFlanking =
      !rightIsWhitespace && (!rightIsPunctuation || leftIsWhitespace || leftIsPunctuation);
    const isRightFlanking =
      !leftIsWhitespace && (!leftIsPunctuation || rightIsWhitespace || rightIsPunctuation);

    tokens.push({
      canClose:
        character === '_'
          ? isRightFlanking && (!isLeftFlanking || rightIsPunctuation)
          : isRightFlanking,
      canOpen:
        character === '_'
          ? isLeftFlanking && (!isRightFlanking || leftIsPunctuation)
          : isLeftFlanking,
      character,
      remaining: length,
      type: 'delimiter',
    });
    index = end;
  }

  return tokens;
}

function pairInlineDelimiters(tokens: InlineToken[]) {
  const delimiterIndexes = tokens.flatMap((token, index) =>
    token.type === 'delimiter' ? [index] : [],
  );
  const blockedOpeners = new Set<number>();

  for (let closerPosition = 0; closerPosition < delimiterIndexes.length; closerPosition += 1) {
    const closerIndex = delimiterIndexes[closerPosition];
    const closer = tokens[closerIndex];
    if (closer.type !== 'delimiter' || !closer.canClose) {
      continue;
    }

    while (closer.remaining > 0) {
      const openerPosition = findMatchingOpener(
        tokens,
        delimiterIndexes,
        closerPosition,
        closer,
        blockedOpeners,
      );
      if (openerPosition === undefined) {
        break;
      }

      const openerIndex = delimiterIndexes[openerPosition];
      const opener = tokens[openerIndex];
      if (opener.type !== 'delimiter') {
        break;
      }

      const delimiterCount =
        closer.character === '~' || (opener.remaining >= 2 && closer.remaining >= 2) ? 2 : 1;
      opener.remaining -= delimiterCount;
      closer.remaining -= delimiterCount;

      for (let position = openerPosition + 1; position < closerPosition; position += 1) {
        const nestedIndex = delimiterIndexes[position];
        const nested = tokens[nestedIndex];
        if (nested.type === 'delimiter' && nested.remaining > 0) {
          blockedOpeners.add(nestedIndex);
        }
      }
    }
  }
}

function findMatchingOpener(
  tokens: InlineToken[],
  delimiterIndexes: number[],
  closerPosition: number,
  closer: Extract<InlineToken, { type: 'delimiter' }>,
  blockedOpeners: Set<number>,
): number | undefined {
  for (let position = closerPosition - 1; position >= 0; position -= 1) {
    const openerIndex = delimiterIndexes[position];
    const opener = tokens[openerIndex];
    if (
      opener.type !== 'delimiter' ||
      blockedOpeners.has(openerIndex) ||
      !opener.canOpen ||
      opener.character !== closer.character ||
      opener.remaining === 0 ||
      (closer.character === '~' && opener.remaining < 2) ||
      violatesMultipleOfThreeRule(opener, closer)
    ) {
      continue;
    }

    return position;
  }

  return undefined;
}

function violatesMultipleOfThreeRule(
  opener: Extract<InlineToken, { type: 'delimiter' }>,
  closer: Extract<InlineToken, { type: 'delimiter' }>,
): boolean {
  if (!(opener.canClose || closer.canOpen)) {
    return false;
  }

  return (
    (opener.remaining + closer.remaining) % 3 === 0 &&
    (opener.remaining % 3 !== 0 || closer.remaining % 3 !== 0)
  );
}

function isDelimiterCharacter(character: string | undefined): character is DelimiterCharacter {
  return character !== undefined && DELIMITER_CHARACTER.test(character);
}
