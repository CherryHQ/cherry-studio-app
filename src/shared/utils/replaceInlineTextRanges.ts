type InlineTextEdit = { start: number; end: number; replacement?: string };

const HORIZONTAL_SPACE = /[\t\p{Zs}]/u;
const LINE_EDGE = /[\r\n]/;
const PUNCTUATION = /[,.;:!?)\]，。、；：！？）】》」』]/;
const ASCII_WORD = /\w/;

/** Apply ordered, disjoint edits and repair whitespace only at deletions. */
export function replaceInlineTextRanges(
  text: string,
  edits: readonly InlineTextEdit[],
  extraPunctuation = '',
): string {
  const fragments: string[] = [];
  let offset = 0;
  for (let index = 0; index < edits.length; index++) {
    const edit = edits[index];
    if (edit.replacement) {
      fragments.push(text.slice(offset, edit.start), edit.replacement);
      offset = edit.end;
      continue;
    }

    let start = edit.start;
    let end = edit.end;
    while (start > offset && HORIZONTAL_SPACE.test(text[start - 1])) start -= 1;
    for (;;) {
      while (HORIZONTAL_SPACE.test(text[end] ?? '')) end += 1;
      const next = edits[index + 1];
      // Adjacent deletions and the horizontal space between them form one gap.
      if (!next || next.replacement || next.start > end) break;
      index += 1;
      end = Math.max(end, next.end);
    }

    const before = text[start - 1] ?? '';
    const after = text[end] ?? '';
    const lastEdit = edits[index];
    const hasSpaceBefore = start < edit.start;
    const hasSpaceAfter = end > lastEdit.end;
    if (
      !before ||
      !after ||
      LINE_EDGE.test(before) ||
      LINE_EDGE.test(after) ||
      PUNCTUATION.test(after) ||
      extraPunctuation.includes(after)
    ) {
      fragments.push(text.slice(offset, start));
    } else if (
      (hasSpaceBefore && hasSpaceAfter) ||
      (!hasSpaceBefore && !hasSpaceAfter && ASCII_WORD.test(before) && ASCII_WORD.test(after))
    ) {
      fragments.push(text.slice(offset, start), ' ');
    } else {
      fragments.push(text.slice(offset, edit.start), text.slice(lastEdit.end, end));
    }
    offset = end;
  }
  return fragments.join('') + text.slice(offset);
}
