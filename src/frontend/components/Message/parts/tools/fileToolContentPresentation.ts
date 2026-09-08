import type { AgentToolInputPreview } from '@/shared/contracts/agent';
import { filenameExtension } from '@/shared/data/types/file';
import { createTextPreview } from '@/shared/utils/textPreview';

import { getToolName, isRecord, type ToolMessagePart } from './toolPartState';

const CODE_LANGUAGES: Readonly<Record<string, string>> = {
  cjs: 'javascript',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cts: 'typescript',
  mts: 'typescript',
  ts: 'typescript',
  tsx: 'tsx',
  htm: 'html',
  html: 'html',
  svg: 'xml',
  xml: 'xml',
  css: 'css',
  scss: 'scss',
  json: 'json',
  jsonc: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'c-sharp',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  sql: 'sql',
  toml: 'toml',
  dart: 'dart',
};

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
  const variant =
    extension === 'md' || extension === 'markdown'
      ? preview.truncated
        ? 'text'
        : 'markdown'
      : extension && ['txt', 'log', 'csv', 'tsv'].includes(extension)
        ? 'text'
        : 'code';

  return {
    ...preview,
    isStreaming,
    name,
    variant,
    language: extension ? (CODE_LANGUAGES[extension] ?? 'text') : 'text',
  };
}
