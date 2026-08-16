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

type DelimiterToken = Extract<InlineToken, { type: 'delimiter' }>;

type Opener = {
  active: boolean;
  order: number;
  token: DelimiterToken;
  version: number;
};

type OpenerHandle = { opener: Opener; version: number };

const DECIMAL_DIGIT_CHARACTER = /\p{Decimal_Number}/u;
const DELIMITER_CHARACTER = /[*_~]/u;
const DELIMITER_CHARACTER_INDEX: Record<DelimiterCharacter, number> = {
  '*': 0,
  _: 1,
  '~': 2,
};
const OPENER_BUCKETS_PER_CHARACTER = 6;
const OPENER_BUCKET_COUNT = 18;
const PUNCTUATION_CHARACTER = /[\p{P}\p{S}]/u;
const WHITESPACE_CHARACTER = /\s/u;

export function projectMarkdownInlineForSpeech(markdown: string): string {
  return markdown.split('\n').map(projectInlineSegmentForSpeech).join('\n');
}

function projectInlineSegmentForSpeech(markdown: string): string {
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
    if (character === '\\') {
      let end = index + 1;
      while (characters[end] === '\\') {
        end += 1;
      }

      const delimiter = characters[end];
      if (isDelimiterCharacter(delimiter)) {
        tokens.push({ type: 'text', value: '\\'.repeat(Math.floor((end - index) / 2)) });
        if ((end - index) % 2 === 1) {
          tokens.push({ type: 'text', value: delimiter });
          end += 1;
        }
        index = end;
        continue;
      }
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
    const leftCharacter = characters[index - 1];
    const rightCharacter = characters[end];
    if (
      character === '*' &&
      length === 1 &&
      leftCharacter !== undefined &&
      DECIMAL_DIGIT_CHARACTER.test(leftCharacter) &&
      rightCharacter !== undefined &&
      DECIMAL_DIGIT_CHARACTER.test(rightCharacter)
    ) {
      tokens.push({ type: 'text', value: character });
      index = end;
      continue;
    }
    if (character === '~' && length !== 2) {
      tokens.push({ type: 'text', value: character.repeat(length) });
      index = end;
      continue;
    }

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
  const activeOpeners: Opener[] = [];
  const openerBuckets = Array.from({ length: OPENER_BUCKET_COUNT }, (): OpenerHandle[] => []);
  let delimiterOrder = 0;

  for (const token of tokens) {
    if (token.type !== 'delimiter') {
      continue;
    }

    if (token.canClose) {
      while (token.remaining > 0) {
        const opener = findMatchingOpener(token, openerBuckets);
        if (!opener) {
          break;
        }

        invalidateOpenersAfter(opener, activeOpeners);
        const delimiterCount =
          token.character === '~' || (opener.token.remaining >= 2 && token.remaining >= 2) ? 2 : 1;
        opener.token.remaining -= delimiterCount;
        token.remaining -= delimiterCount;

        if (opener.token.remaining === 0) {
          opener.active = false;
          activeOpeners.pop();
        } else {
          opener.version += 1;
          indexOpener(opener, openerBuckets);
        }
      }
    }

    if (token.canOpen && token.remaining > 0) {
      const opener: Opener = {
        active: true,
        order: delimiterOrder,
        token,
        version: 0,
      };
      activeOpeners.push(opener);
      indexOpener(opener, openerBuckets);
    }
    delimiterOrder += 1;
  }
}

function findMatchingOpener(
  closer: DelimiterToken,
  openerBuckets: OpenerHandle[][],
): Opener | undefined {
  const firstBucket = DELIMITER_CHARACTER_INDEX[closer.character] * OPENER_BUCKETS_PER_CHARACTER;
  let nearest: Opener | undefined;

  for (let offset = 0; offset < OPENER_BUCKETS_PER_CHARACTER; offset += 1) {
    const opener = peekCurrentOpener(openerBuckets[firstBucket + offset]);
    if (
      !opener ||
      (closer.character === '~' && opener.token.remaining < 2) ||
      violatesMultipleOfThreeRule(opener.token, closer)
    ) {
      continue;
    }

    if (!nearest || opener.order > nearest.order) {
      nearest = opener;
    }
  }

  return nearest;
}

function peekCurrentOpener(bucket: OpenerHandle[]): Opener | undefined {
  let handle = bucket.at(-1);
  while (handle && (!handle.opener.active || handle.version !== handle.opener.version)) {
    bucket.pop();
    handle = bucket.at(-1);
  }
  return handle?.opener;
}

function invalidateOpenersAfter(opener: Opener, activeOpeners: Opener[]) {
  let active = activeOpeners.at(-1);
  while (active && active !== opener) {
    active.active = false;
    activeOpeners.pop();
    active = activeOpeners.at(-1);
  }
}

function indexOpener(opener: Opener, openerBuckets: OpenerHandle[][]) {
  const bucketIndex =
    DELIMITER_CHARACTER_INDEX[opener.token.character] * OPENER_BUCKETS_PER_CHARACTER +
    Number(opener.token.canClose) * 3 +
    (opener.token.remaining % 3);
  openerBuckets[bucketIndex].push({ opener, version: opener.version });
}

function violatesMultipleOfThreeRule(opener: DelimiterToken, closer: DelimiterToken): boolean {
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
