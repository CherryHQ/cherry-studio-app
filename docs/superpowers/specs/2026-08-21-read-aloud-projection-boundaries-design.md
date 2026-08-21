# Read-Aloud Projection Boundary Fixes Design

## Context

PR 557 adds pure Chat-owned helpers that turn a completed assistant message into speakable text and
an optional language hint. Review of the current head found five deterministic gaps: mixed-language
block translations can regain a single inferred language, multiline code spans are not protected,
plain numeric brackets are deleted as citations, deep list continuations are removed as code, and
legal link/URL forms leave Markdown punctuation behind.

The helpers currently have no production caller. This makes the contract safe to tighten before the
native TTS integration starts consuming it.

## Goals

- Preserve a system-default voice for content known to contain mixed languages.
- Project legal multiline code spans without exposing their Markdown delimiters or altering their
  content.
- Remove only unambiguous citation forms.
- Distinguish deep list continuations from list-contained indented code.
- Remove inline links, autolinks, and bare URLs without leaving structural punctuation.
- Keep every scanner linear in the input length and feature-owned under Chat workspace utilities.

## Non-Goals

- Adding a TTS runtime, toolbar, state provider, or native speech integration.
- Building a general-purpose Markdown parser or matching every renderer extension.
- Moving the helpers into a shared frontend or cross-layer package.
- Introducing a segmented speech API before a caller demonstrates that it needs per-segment voices.

## Ownership and Architecture

The implementation remains in
`src/frontend/features/chat/workspace/utils/projectAssistantMessageReadAloud.ts`, with the existing
inline emphasis projector kept in its focused file. Tests remain co-located in
`src/frontend/features/chat/workspace/utils/__tests__` because the workspace owns the behavior and
there is no independent consumer.

The repair extends the existing staged projection pipeline rather than introducing a dependency:

1. Select original or translated message blocks and determine their language state.
2. Remove fenced and indented code using container-relative indentation.
3. Protect code spans with opaque tokens.
4. Project block math, tables, links, citations, and inline math.
5. Project paired emphasis delimiters, restore code spans, and normalize whitespace.

All opaque-token invariants remain internal to the projection helper.

## Language Contract

`AssistantReadAloudContent.language` becomes a tri-state value:

- a non-empty `string`: the complete projected text has an explicit language;
- `undefined`: the language is unknown and conservative Kana/Hangul inference is allowed;
- `null`: the text is known to mix original and translated language blocks, so inference must be
  skipped and the platform default voice must be used.

`resolveAssistantReadAloudLanguage` accepts the same tri-state input. It returns the explicit string,
returns `undefined` immediately for `null`, and performs its existing conservative inference only for
`undefined`.

A whole-message translation and a message whose every retained block is translated into the same
language keep a string language. Original-only content keeps `undefined`. Any retained mix of
original and translated blocks, or translated blocks with different target languages, returns
`null`.

## Code Span Projection

Code span protection scans the complete normalized Markdown string instead of splitting it by line.
An opening backtick run closes only at the next run with exactly the same length. The scan stores the
content in the existing opaque-token table and advances past the closing run, preserving linear
runtime.

Line endings inside a matched code span become spaces before storage. Overall speech whitespace
normalization then collapses repeated spaces. Unmatched runs remain literal and continue through the
normal inline projection path.

## Links, URLs, and Citations

Inline link scanning becomes structural on both sides:

- label scanning observes backslash escapes and balanced nested brackets;
- destination scanning retains the existing escaped-character and balanced-parenthesis behavior;
- images and numeric inline citation links are omitted, while ordinary links retain their visible
  label;
- HTTP(S) autolinks consume their surrounding angle brackets;
- bare HTTP(S) URLs track balanced parentheses and peel only punctuation that is outside the URL.

For `https://example.test/Foo_(bar).`, the balanced closing parenthesis belongs to the URL and only
the final period is returned as surrounding punctuation. An unmatched closing parenthesis remains
outside punctuation.

`[cite:...]`, linked numeric citations such as `[2](url)`, and the existing `【2†source】` form remain
unambiguous and are removed. A plain `[2]` is preserved because the projection has no citation
metadata that can distinguish it from an array index or other literal syntax.

## List-Relative Indented Code

List marker parsing accepts leading indentation relative to any active list content indent, not only
absolute columns zero through three. The parser records the marker and content columns globally, so
deeper nested items extend the existing stack instead of being mistaken for continuation text.

A non-marker line is indented code only when its leading column is at least four columns beyond the
deepest active item content indent. Thus a continuation two columns beyond a deep item is retained,
while a line four columns beyond it is removed.

## Error Handling and Performance

Malformed constructs remain literal rather than causing broad deletion. Unterminated fenced code is
the existing exception: once a valid opening fence is found, the remainder remains non-speakable
code. Every new scan advances monotonically and avoids recursive parsing, nested ambiguous regex
branches, and repeated rescans from the beginning of the message.

## Tests

The lowest-owner suites add one regression per contract:

- mixed English/Japanese block translation passes `null` through projection and resolves to the
  system default;
- a multiline code span preserves `__init__` and removes equal-length backtick delimiters;
- `values[2]` and plain `[2]` remain literal while `[2](url)` is omitted;
- a two-level nested list retains a legal continuation and removes code four columns deeper;
- balanced-parenthesis bare URLs, HTTP(S) autolinks, nested link labels, and escaped label brackets
  leave no outer link punctuation.

The existing malformed-input and long unmatched-delimiter tests continue to guard linear behavior.
Completion validation runs the three focused suites followed by the repository-required lint,
format, and typecheck gates.
