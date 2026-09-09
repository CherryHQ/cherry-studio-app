import type { AgentToolInputPreview } from '@/shared/contracts/agent';
import { filenameExtension } from '@/shared/data/types/file';
import { createTextPreview } from '@/shared/utils/textPreview';

import { getToolName, isRecord, type ToolMessagePart } from './toolPartState';

export function getFileToolContent(part: ToolMessagePart, live?: AgentToolInputPreview) {
  const toolName = getToolName(part);
  if (toolName !== 'write_file' && toolName !== 'edit_file') return undefined;
  const input = isRecord(part.input) ? part.input : undefined;
  const output = isRecord(part.output) ? part.output : undefined;
  const fullText = input?.[toolName === 'write_file' ? 'content' : 'new_string'];
  const isStreaming = part.state === 'input-streaming';
  const preview: AgentToolInputPreview | undefined = isStreaming
    ? (live ?? part.inputPreview)
    : typeof fullText === 'string'
      ? createTextPreview(fullText)
      : (part.inputPreview ?? live);
  if (!preview?.text) return undefined;
  const name =
    typeof input?.filename === 'string'
      ? input.filename
      : typeof output?.filename === 'string'
        ? output.filename
        : preview.name;
  const extension = name ? filenameExtension(name) : undefined;
  return {
    ...preview,
    isStreaming,
    name,
    isCode: !extension || !['md', 'markdown', 'txt', 'log', 'csv', 'tsv'].includes(extension),
  };
}
