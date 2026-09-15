// Protocol variants from Cherry Desktop #19921; execution stays with each consumer.
const TOOL_CALLS_OPEN = ['<｜DSML｜tool_calls>', '<｜｜DSML｜｜tool_calls>'];
const TOOL_CALLS_CLOSE = ['</｜DSML｜tool_calls>', '</｜｜DSML｜｜tool_calls>'];
const TOOL_LOOP_OPEN = ['<｜DSML｜Tool loop>', '<｜｜DSML｜｜Tool loop>'];
const TOOL_LOOP_CLOSE = ['</｜DSML｜Tool>', '</｜｜DSML｜｜Tool>'];
const OPEN_TAGS = [...TOOL_CALLS_OPEN, ...TOOL_LOOP_OPEN];
const MARKERS = [
  '<｜DSML｜',
  '</｜DSML｜',
  '<｜｜DSML｜｜',
  '</｜｜DSML｜｜',
  '<|dsml|>',
  '</|dsml|>',
];
const BUFFER_LIMIT = 64 * 1024;
const INVOKE_PATTERN =
  /<｜{1,2}DSML｜{1,2}(?:tool_)?(invoke|tool)\s+name="([^"]+)">([\s\S]*?)<\/｜{1,2}DSML｜{1,2}(?:tool_)?\1>/g;
const PARAMETER_PATTERN =
  /<｜{1,2}DSML｜{1,2}parameter\s+name="([^"]+)"(?:\s+string="(true|false)")?>([\s\S]*?)<\/｜{1,2}DSML｜{1,2}parameter>/g;

export class DeepseekDsmlError extends Error {
  readonly code = 'deepseek_dsml_parse_error';
  readonly retryable = false;

  constructor() {
    super('DeepSeek returned an incomplete or unsupported tool call. Please retry the request.');
    this.name = 'DeepseekDsmlError';
  }
}

export type DeepseekDsmlCall = {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
};

export type DeepseekDsmlPart = { type: 'text'; text: string } | DeepseekDsmlCall;

type ToolName = { name: string };

function call(
  toolName: string,
  input: Record<string, unknown>,
  tools: readonly ToolName[],
): DeepseekDsmlCall {
  const matches = tools.filter((tool) => tool.name.toLowerCase() === toolName.toLowerCase());
  return {
    type: 'tool-call',
    toolCallId: `dsml_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    toolName: matches.length === 1 ? matches[0].name : toolName,
    input,
  };
}

function parseCalls(
  content: string,
  openTag: string,
  tools: readonly ToolName[],
): DeepseekDsmlCall[] {
  if (TOOL_LOOP_OPEN.includes(openTag)) {
    const search = /^\s*<search>([\s\S]+)<\/search>\s*$/.exec(content);
    if (search) {
      const searchTools = tools.filter((tool) =>
        ['toolsearch', 'tool_search'].includes(tool.name.toLowerCase()),
      );
      if (searchTools.length !== 1) throw new DeepseekDsmlError();
      return [call(searchTools[0].name, { query: search[1] }, tools)];
    }
  }

  const calls: DeepseekDsmlCall[] = [];
  const remainder = content.replace(
    INVOKE_PATTERN,
    (_match, _kind: string, name: string, parameters: string) => {
      const entries = new Map<string, unknown>();
      const remainingParameters = parameters.replace(
        PARAMETER_PATTERN,
        (_parameter, key: string, string: string | undefined, value: string) => {
          if (entries.has(key)) throw new DeepseekDsmlError();
          try {
            entries.set(key, string === 'false' ? JSON.parse(value) : value);
          } catch {
            throw new DeepseekDsmlError();
          }
          return '';
        },
      );
      if (remainingParameters.trim()) throw new DeepseekDsmlError();
      calls.push(call(name, Object.fromEntries(entries), tools));
      return '';
    },
  );
  // Never execute a valid prefix when a sibling call or parameter was truncated.
  if (remainder.trim() || calls.length === 0) throw new DeepseekDsmlError();
  return calls;
}

function firstTag(
  text: string,
  tags: readonly string[],
): { index: number; tag: string } | undefined {
  let first: { index: number; tag: string } | undefined;
  for (const tag of tags) {
    const index = text.indexOf(tag);
    if (index >= 0 && (!first || index < first.index)) first = { index, tag };
  }
  return first;
}

function partialMarkerLength(text: string): number {
  const limit = Math.min(text.length, Math.max(...MARKERS.map((marker) => marker.length)) - 1);
  for (let length = limit; length > 0; length -= 1) {
    if (MARKERS.some((marker) => marker.startsWith(text.slice(-length)))) return length;
  }
  return 0;
}

/** One bounded parser per text/reasoning block; never share state between requests. */
export function createDeepseekDsmlParser(tools: readonly ToolName[] = []) {
  let buffer = '';
  let openTag: string | undefined;

  return {
    push(delta: string): DeepseekDsmlPart[] {
      buffer += delta;
      const parts: DeepseekDsmlPart[] = [];
      while (buffer) {
        if (openTag) {
          const close = firstTag(
            buffer,
            TOOL_LOOP_OPEN.includes(openTag) ? TOOL_LOOP_CLOSE : TOOL_CALLS_CLOSE,
          );
          if (!close) {
            if (buffer.length > BUFFER_LIMIT) throw new DeepseekDsmlError();
            break;
          }
          if (close.index > BUFFER_LIMIT) throw new DeepseekDsmlError();
          parts.push(...parseCalls(buffer.slice(0, close.index), openTag, tools));
          buffer = buffer.slice(close.index + close.tag.length);
          openTag = undefined;
          continue;
        }

        const marker = firstTag(buffer, MARKERS);
        if (!marker) {
          const pendingLength = partialMarkerLength(buffer);
          const text = buffer.slice(0, buffer.length - pendingLength);
          if (text) parts.push({ type: 'text', text });
          buffer = buffer.slice(buffer.length - pendingLength);
          break;
        }
        if (marker.index > 0) parts.push({ type: 'text', text: buffer.slice(0, marker.index) });
        buffer = buffer.slice(marker.index);
        openTag = OPEN_TAGS.find((tag) => buffer.startsWith(tag));
        if (!openTag) {
          if (buffer.includes('>') || buffer.length > BUFFER_LIMIT) throw new DeepseekDsmlError();
          break;
        }
        buffer = buffer.slice(openTag.length);
      }
      return parts;
    },
    finish(): DeepseekDsmlPart[] {
      if (openTag || /DSML|dsml/.test(buffer)) throw new DeepseekDsmlError();
      const parts: DeepseekDsmlPart[] = buffer ? [{ type: 'text', text: buffer }] : [];
      buffer = '';
      return parts;
    },
  };
}
