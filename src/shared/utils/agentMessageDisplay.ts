import type { AgentMessagePart, AgentMessageView } from '@/shared/contracts/agent';

import { createTextPreview } from './textPreview';

/** A display budget, never a generation or execution limit. */
export const REASONING_PREVIEW_CHARACTERS = 2_000;
export const TOOL_RESULT_PREVIEW_CHARACTERS = 2_000;

export function reasoningPreview(text: string) {
  return createTextPreview(text, {
    characters: REASONING_PREVIEW_CHARACTERS,
    lines: Number.POSITIVE_INFINITY,
  });
}

export function isCompactTool(name: string): boolean {
  return [
    'codemode',
    'run_js',
    'run_office_script',
    'create_document',
    'create_workbook',
    'create_presentation',
    'edit_document',
    'edit_workbook',
    'edit_presentation',
  ].includes(name);
}

/** Keep receipts, not logs, code or arbitrarily nested values, in ordinary script details. */
export function compactToolValue(value: unknown): Record<string, string | number | boolean | null> {
  if (typeof value === 'string') return { output: value.slice(0, TOOL_RESULT_PREVIEW_CHARACTERS) };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: Record<string, string | number | boolean | null> = {};
  for (const key of [
    'status',
    'filename',
    'fileEntryId',
    'mediaType',
    'size',
    'message',
    'output',
    'result',
  ]) {
    const item = source[key];
    if (typeof item === 'string') result[key] = item.slice(0, TOOL_RESULT_PREVIEW_CHARACTERS);
    else if (typeof item === 'number' || typeof item === 'boolean' || item === null)
      result[key] = item;
  }
  return result;
}

const displayParts = new WeakMap<AgentMessagePart, AgentMessagePart>();

function displayPart(part: AgentMessagePart): AgentMessagePart {
  const cached = displayParts.get(part);
  if (cached) return cached;
  let projected = part;
  if (part.type === 'reasoning') {
    const preview = reasoningPreview(part.text);
    if (preview.truncated) projected = { ...part, ...preview };
  } else if (
    part.type === 'dynamic-tool' &&
    part.toolRef.source !== 'mcp' &&
    isCompactTool(part.toolName) &&
    part.state !== 'awaiting-approval'
  ) {
    const { input: _input, inputPreview: _preview, output, ...rest } = part;
    const result =
      output && typeof output === 'object' && !Array.isArray(output) ? output : undefined;
    const value = result?.value;
    projected = {
      ...rest,
      ...(part.error
        ? {
            error: {
              ...part.error,
              message: part.error.message.slice(0, TOOL_RESULT_PREVIEW_CHARACTERS),
            },
          }
        : {}),
      ...(result && part.state === 'output-available'
        ? {
            output: {
              value: compactToolValue(value),
              artifacts: result.artifacts ?? [],
            },
          }
        : {}),
    };
  }
  displayParts.set(part, projected);
  displayParts.set(projected, projected);
  return projected;
}

/** Presentation only. Persisted parts, provider signatures, approvals and model context stay intact. */
export function projectAgentMessageDisplay(message: AgentMessageView): AgentMessageView {
  if (message.role !== 'assistant') return message;
  const parts: AgentMessagePart[] = [];
  for (const source of message.parts) {
    const part = displayPart(source);
    const previous = parts.at(-1);
    if (part.type === 'reasoning' && previous?.type === 'reasoning') {
      const combined = reasoningPreview(
        part.text.trim() ? `${previous.text}\n\n${part.text}` : previous.text,
      );
      parts[parts.length - 1] = {
        ...previous,
        text: combined.text,
        ...(previous.truncated || part.truncated || combined.truncated ? { truncated: true } : {}),
        state: part.state,
      };
    } else if (part.type !== 'reasoning' || part.text.trim() || part.state === 'streaming')
      parts.push(part);
  }
  return parts.length === message.parts.length &&
    parts.every((part, index) => part === message.parts[index])
    ? message
    : { ...message, parts };
}
