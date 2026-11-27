import { selectAssistantBodyTextParts } from '@/frontend/components/Message/body';
import { stripMessageCitations, type CitationSource } from '@/frontend/utils/messageCitations';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { speakableText } from '@/shared/utils/speechText';

const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;
const INDENTED_CODE_LINE = /^(?: {0,3}>[ \t]?)*(?:\t| {2,})/;
const FENCE_LINE = /^(?: {0,3}>[ \t]?)* {0,3}(`{3,}|~{3,})(.*)$/;
const STANDALONE_MATH_DELIMITER = /^(?: {0,3}>[ \t]?)* {0,3}(\$\$|\\\[|\\\])[ \t]*$/;
const NEEDS_FULL_SPEECH_PARSE = /[`<$\\~![]|https?:\/\//i;

function hasUnambiguousSpokenProseLine(text: string): boolean {
  let fence: { char: string; count: number } | undefined;
  let inHtmlComment = false;
  let inHtmlTagBlock = false;
  let mathBlock: '$$' | '\\[' | undefined;

  for (const rawLine of text.split(/\r\n?|\n/)) {
    const line = rawLine.trimEnd();
    if (fence) {
      const closeMatch = FENCE_LINE.exec(line);
      if (
        closeMatch &&
        closeMatch[1][0] === fence.char &&
        closeMatch[1].length >= fence.count &&
        closeMatch[2].trim() === ''
      ) {
        fence = undefined;
      }
      continue;
    }
    if (inHtmlComment) {
      if (line.includes('-->')) inHtmlComment = false;
      continue;
    }
    if (inHtmlTagBlock) {
      if (!line.trim()) inHtmlTagBlock = false;
      continue;
    }
    const mathMatch = STANDALONE_MATH_DELIMITER.exec(line);
    if (mathBlock) {
      if (mathMatch && mathMatch[1] === (mathBlock === '$$' ? '$$' : '\\]')) {
        mathBlock = undefined;
      }
      continue;
    }

    const fenceMatch = FENCE_LINE.exec(line);
    if (fenceMatch && (fenceMatch[1][0] !== '`' || !fenceMatch[2].includes('`'))) {
      fence = { char: fenceMatch[1][0], count: fenceMatch[1].length };
      continue;
    }
    if (line.includes('<!--')) {
      if (!line.includes('-->')) inHtmlComment = true;
      continue;
    }
    if (/^\s*</.test(line)) {
      if (line.trim()) inHtmlTagBlock = true;
      continue;
    }
    if (mathMatch && (mathMatch[1] === '$$' || mathMatch[1] === '\\[')) {
      mathBlock = mathMatch[1];
      continue;
    }
    if (
      !INDENTED_CODE_LINE.test(line) &&
      !NEEDS_FULL_SPEECH_PARSE.test(line) &&
      HAS_WORD_CHAR.test(line)
    ) {
      return true;
    }
  }
  return false;
}

function extractSpeechAssistantMessageText(
  normalizedParts: readonly CherryMessagePart[],
  bodyTextParts: ReturnType<typeof selectAssistantBodyTextParts>['bodyTextParts'],
  sources?: readonly CitationSource[],
): string {
  if (bodyTextParts.length === 0) return '';
  const textByPartIndex = stripMessageCitations(
    normalizedParts,
    sources,
    new Set(bodyTextParts.map(({ index }) => index)),
  );
  return speakableText(
    bodyTextParts.map(({ index, part }) => textByPartIndex.get(index) ?? part.text).join('\n\n'),
  );
}

/** Lightweight availability check that avoids full Markdown/citation parsing on typical prose. */
export function hasSpeakableAssistantMessageText(
  parts: readonly CherryMessagePart[],
  sources?: readonly CitationSource[],
): boolean {
  const { parts: normalizedParts, bodyTextParts } = selectAssistantBodyTextParts(parts);
  if (bodyTextParts.length === 0) return false;
  if (bodyTextParts.some(({ part }) => hasUnambiguousSpokenProseLine(part.text))) return true;
  return Boolean(extractSpeechAssistantMessageText(normalizedParts, bodyTextParts, sources));
}

export function speechAssistantMessageText(
  parts: readonly CherryMessagePart[],
  sources?: readonly CitationSource[],
): string {
  const { parts: normalizedParts, bodyTextParts } = selectAssistantBodyTextParts(parts);
  return extractSpeechAssistantMessageText(normalizedParts, bodyTextParts, sources);
}
