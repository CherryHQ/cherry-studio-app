import type { AgentToolInputPreview } from '@/shared/contracts/agent';
import { filenameExtension } from '@/shared/data/types/file';

import { getToolName, isRecord, type ToolMessagePart } from './toolPartState';

const CONTENT_CHUNK_CHARACTERS = 1_024;
const CONTENT_CHUNK_LINES = 16;

export type FileToolTextChunk = { offset: number; text: string };

export function getFileToolContent(part: ToolMessagePart, live?: AgentToolInputPreview) {
  const toolName = getToolName(part);
  if (toolName !== 'write_file' && toolName !== 'edit_file') return undefined;
  const input = isRecord(part.input) ? part.input : undefined;
  const output = isRecord(part.output) ? part.output : undefined;
  const fullText = input?.[toolName === 'write_file' ? 'content' : 'new_string'];
  const isStreaming = part.state === 'input-streaming';
  const hasFullText = !isStreaming && typeof fullText === 'string';
  const preview = isStreaming ? (live ?? part.inputPreview) : (part.inputPreview ?? live);
  const text = hasFullText ? fullText : preview?.text;
  if (!text) return undefined;
  const name =
    typeof input?.filename === 'string'
      ? input.filename
      : typeof output?.filename === 'string'
        ? output.filename
        : preview?.name;
  const extension = name ? filenameExtension(name) : undefined;
  return {
    text,
    truncated: hasFullText ? false : (preview?.truncated ?? false),
    isStreaming,
    name,
    isCode: !extension || !['md', 'markdown', 'txt', 'log', 'csv', 'tsv'].includes(extension),
  };
}

/** Preserve the full source while bounding each native text layout, including minified files. */
export function splitFileToolContent(text: string): FileToolTextChunk[] {
  const chunks: FileToolTextChunk[] = [];
  let offset = 0;
  while (offset < text.length) {
    let end = Math.min(offset + CONTENT_CHUNK_CHARACTERS, text.length);
    // Do not split a surrogate pair or a Windows line ending across text nodes.
    const lastCode = text.charCodeAt(end - 1);
    if (
      end < text.length &&
      ((lastCode >= 0xd800 && lastCode <= 0xdbff) || (text[end - 1] === '\r' && text[end] === '\n'))
    ) {
      end -= 1;
    }
    const candidate = text.slice(offset, end);
    let lastNewline = -1;
    let position = 0;
    let lineCount = 0;
    while (lineCount < CONTENT_CHUNK_LINES) {
      const newline = candidate.indexOf('\n', position);
      if (newline < 0) break;
      lastNewline = newline;
      position = newline + 1;
      lineCount += 1;
    }
    if (lastNewline >= 0 && (end < text.length || lineCount === CONTENT_CHUNK_LINES)) {
      end = offset + lastNewline + 1;
    }
    chunks.push({ offset, text: text.slice(offset, end) });
    offset = end;
  }
  return chunks;
}
