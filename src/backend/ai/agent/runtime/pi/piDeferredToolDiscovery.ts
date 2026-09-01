import type { AgentTool as PiAgentTool } from '@earendil-works/pi-agent-core';
import * as z from 'zod';

import type { RuntimeJsonValue, RuntimeTool, RuntimeToolResult } from '../types';

export const PI_TOOL_SEARCH_TOOL_NAME = 'tool_search';
export const PI_TOOL_DESCRIBE_TOOL_NAME = 'tool_describe';
export const PI_TOOL_CALL_TOOL_NAME = 'tool_call';

export const PI_DEFERRED_TOOL_DISCOVERY_SYSTEM_PROMPT = `MCP tools are available through a searchable catalog.
Use tool_search only for tool discovery, not for web search or general research.
Use tool_search to discover relevant tools and their TypeScript signatures.
Narrow the search query when the result reports truncated: true.
Use tool_describe when you need the bounded signature for one exact tool name.
Use tool_call with an exact discovered name and params matching that signature.
If tool_call returns a signature, read it and retry with corrected params.
Do not guess tool names or parameters.`;

const SEARCH_RESULT_LIMIT = 20;
const SEARCH_RESULT_CHARACTER_LIMIT = 32_000;
const TOOL_DECLARATION_CHARACTER_LIMIT = 8_000;
const TOOL_DESCRIPTION_CHARACTER_LIMIT = 1_000;
const MIN_TOOL_DECLARATION_CHARACTER_LIMIT = 512;
const DISPATCH_ACTIVITY_NAME_CHARACTER_LIMIT = 256;
const TOOL_SCHEMA_RENDER_CHARACTER_LIMIT = 32_000;
const TOOL_CORRECTION_DECLARATION_CHARACTER_LIMIT = 3_000;
const BM25_K1 = 1.2;
const BM25_B = 0.75;
const MAX_NESTING_DEPTH = 5;

const SEARCH_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'BM25 query matched against MCP tool names and descriptions. Omit to browse.',
    },
  },
  additionalProperties: false,
} satisfies RuntimeJsonValue;

const DESCRIBE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Exact tool name returned by tool_search.' },
  },
  required: ['name'],
  additionalProperties: false,
} satisfies RuntimeJsonValue;

const CALL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Exact tool name returned by tool_search.' },
    params: { type: 'object', description: 'Arguments matching the discovered tool signature.' },
  },
  required: ['name', 'params'],
  additionalProperties: false,
} satisfies RuntimeJsonValue;

type InvokeTargetTool = (
  target: RuntimeTool,
  input: RuntimeJsonValue,
  toolCallId: string,
  signal: AbortSignal | undefined,
) => Promise<RuntimeToolResult>;

export type PiMetaToolActivity = {
  displayName: string;
  input: RuntimeJsonValue;
  providerName: string;
};

export type PiMetaToolExecution = {
  activityOutput: RuntimeToolResult;
  modelOutput: RuntimeToolResult;
};

type RunMetaTool = (
  toolCallId: string,
  signal: AbortSignal | undefined,
  activity: PiMetaToolActivity,
  operation: (modelOutputCharacterLimit: number) => PiMetaToolExecution,
) => Promise<RuntimeToolResult>;

/**
 * Project one frozen MCP catalog into three Pi model-loop tools for deferred
 * discovery. Search and describe publish compact meta activity while the full
 * result stays in Pi; a resolved target re-enters Runtime tool execution.
 */
export function createPiDeferredToolDiscoveryTools(
  tools: readonly RuntimeTool[],
  invokeTarget: InvokeTargetTool,
  runMetaTool: RunMetaTool,
): PiAgentTool[] {
  const catalog = new Map(tools.map((tool) => [tool.providerName, tool]));
  const inspectedNames = new Set<string>();
  const inputValidators = new Map<string, z.ZodType | null>();

  const searchTool: PiAgentTool = {
    name: PI_TOOL_SEARCH_TOOL_NAME,
    label: 'Search tools',
    description:
      'Search the available MCP tool catalog. Returns matching names, descriptions, and TypeScript signatures for use with tool_call. Narrow the query when the result is truncated.',
    parameters: SEARCH_INPUT_SCHEMA as never,
    async execute(toolCallId, params, signal) {
      const input = (isRecord(params) ? params : {}) as RuntimeJsonValue;
      const output = await runMetaTool(
        toolCallId,
        signal,
        { displayName: 'Search tools', input, providerName: PI_TOOL_SEARCH_TOOL_NAME },
        (modelOutputCharacterLimit) => {
          const query = isRecord(params) && typeof params.query === 'string' ? params.query : '';
          const searchResult = boundedSearchResult(
            rankTools([...catalog.values()], query),
            modelOutputCharacterLimit,
          );
          for (const match of searchResult.matches) inspectedNames.add(match.name);

          return {
            modelOutput: searchResult.output,
            activityOutput: {
              value: {
                matchedNamespaces:
                  searchResult.matches.length > 0
                    ? [
                        {
                          namespace: 'mcp',
                          tools: searchResult.matches.map(({ name }) => ({ name })),
                        },
                      ]
                    : [],
                ...(searchResult.truncated ? { truncated: true } : {}),
              },
              artifacts: [],
            },
          };
        },
      );
      return toPiToolResult(output);
    },
  };

  const describeTool: PiAgentTool = {
    name: PI_TOOL_DESCRIBE_TOOL_NAME,
    label: 'Describe tool',
    description: 'Get the bounded description and TypeScript signature for one discovered tool.',
    parameters: DESCRIBE_INPUT_SCHEMA as never,
    async execute(toolCallId, params, signal) {
      const input = (isRecord(params) ? params : {}) as RuntimeJsonValue;
      const output = await runMetaTool(
        toolCallId,
        signal,
        { displayName: 'Describe tool', input, providerName: PI_TOOL_DESCRIBE_TOOL_NAME },
        (modelOutputCharacterLimit) => {
          const name = isRecord(params) && typeof params.name === 'string' ? params.name : '';
          const tool = catalog.get(name);
          if (!tool) throw toolNotFoundError(name);
          inspectedNames.add(name);
          return {
            modelOutput: boundedDescribeResult(tool, modelOutputCharacterLimit),
            activityOutput: {
              value: { name: tool.providerName },
              artifacts: [],
            },
          };
        },
      );
      return toPiToolResult(output);
    },
  };

  const callTool: PiAgentTool = {
    name: PI_TOOL_CALL_TOOL_NAME,
    label: 'Call tool',
    description:
      'Call one MCP tool using an exact name and params matching a signature returned by tool_search or tool_describe. An unseen or invalid call returns the expected signature for a corrected retry.',
    parameters: CALL_INPUT_SCHEMA as never,
    async execute(toolCallId, params, signal) {
      const input = isRecord(params) ? params : {};
      const name = typeof input.name === 'string' ? input.name : '';
      const targetInput = (isRecord(input.params) ? input.params : {}) as RuntimeJsonValue;
      const tool = catalog.get(name);
      if (!tool) {
        const output = await runMetaTool(
          toolCallId,
          signal,
          {
            displayName: 'Call tool',
            input: createPiDispatchActivityInput(input),
            providerName: PI_TOOL_CALL_TOOL_NAME,
          },
          () => {
            throw toolNotFoundError(name);
          },
        );
        return toPiToolResult(output);
      }

      if (!inspectedNames.has(name)) {
        inspectedNames.add(name);
        const output = await runRejectedDispatch(
          input,
          toolCallId,
          signal,
          runMetaTool,
          (modelOutputCharacterLimit) => {
            throw toolSignatureError(
              tool,
              'tool_schema_not_inspected',
              `Tool "${name}" has not been inspected yet. Read the signature below, then call tool_call again with matching params.`,
              modelOutputCharacterLimit,
            );
          },
        );
        return toPiToolResult(output);
      }

      if (!matchesToolInput(tool, targetInput, inputValidators)) {
        const output = await runRejectedDispatch(
          input,
          toolCallId,
          signal,
          runMetaTool,
          (modelOutputCharacterLimit) => {
            throw toolSignatureError(
              tool,
              'tool_input_invalid',
              `Invalid params for "${name}". Read the expected signature below, then call tool_call again with corrected params.`,
              modelOutputCharacterLimit,
            );
          },
        );
        return toPiToolResult(output);
      }

      const output = await invokeTarget(tool, targetInput, toolCallId, signal);
      return toPiToolResult(output);
    },
  };

  return [searchTool, describeTool, callTool];
}

function toPiToolResult(output: RuntimeToolResult) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(output) }],
    details: output,
  };
}

function toolNotFoundError(name: string) {
  return Object.assign(new Error(`Tool not found: ${name}`), {
    code: 'tool_not_found',
    retryable: false,
  });
}

function runRejectedDispatch(
  input: Record<string, unknown>,
  toolCallId: string,
  signal: AbortSignal | undefined,
  runMetaTool: RunMetaTool,
  reject: (modelOutputCharacterLimit: number) => never,
) {
  return runMetaTool(
    toolCallId,
    signal,
    {
      displayName: 'Call tool',
      input: createPiDispatchActivityInput(input),
      providerName: PI_TOOL_CALL_TOOL_NAME,
    },
    reject,
  );
}

function toolSignatureError(
  tool: RuntimeTool,
  code: string,
  message: string,
  modelOutputCharacterLimit: number,
) {
  const declaration = toolToTypeScript(
    tool,
    Math.min(
      TOOL_CORRECTION_DECLARATION_CHARACTER_LIMIT,
      Math.max(1, Math.floor(modelOutputCharacterLimit / 2)),
    ),
  );
  return Object.assign(new Error(`${message}\n\nExpected signature:\n${declaration}`), {
    code,
    retryable: false,
  });
}

function matchesToolInput(
  tool: RuntimeTool,
  input: RuntimeJsonValue,
  inputValidators: Map<string, z.ZodType | null>,
): boolean {
  if (!inputValidators.has(tool.providerName)) {
    inputValidators.set(tool.providerName, createToolInputValidator(tool));
  }

  // A tool with no validator was never rendered as a contract the model could
  // satisfy, so rejecting its params would return the same signature forever
  // and burn the turn's tool-call budget. Let those calls through.
  const validator = inputValidators.get(tool.providerName);
  return validator ? validator.safeParse(input).success : true;
}

function createToolInputValidator(tool: RuntimeTool): z.ZodType | null {
  // The catalog omits a schema this large, so the model only ever sees
  // `params: Record<string, unknown>` for this tool.
  if (!isJsonWithinCharacterLimit(tool.inputSchema, TOOL_SCHEMA_RENDER_CHARACTER_LIMIT)) {
    return null;
  }

  try {
    // Draft-07 `#/definitions` refs, `if`/`then`/`else`, `not`, `dependentSchemas`
    // and `unevaluatedProperties` all throw here.
    return z.fromJSONSchema(tool.inputSchema as Parameters<typeof z.fromJSONSchema>[0]);
  } catch {
    return null;
  }
}

function rankTools(tools: readonly RuntimeTool[], query: string): RuntimeTool[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [...tools];

  const documents = tools.map((tool) => tokenize(`${tool.providerName} ${tool.description}`));
  const averageLength =
    documents.reduce((sum, document) => sum + document.length, 0) / documents.length || 1;
  const documentFrequency = new Map<string, number>();
  for (const document of documents) {
    for (const term of new Set(document)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  return tools
    .map((tool, index) => {
      const document = documents[index] ?? [];
      const score = terms.reduce((total, term) => {
        const frequency = document.filter((token) => token === term).length;
        if (frequency === 0) return total;
        const containingDocuments = documentFrequency.get(term) ?? 0;
        const idf = Math.log(
          1 + (documents.length - containingDocuments + 0.5) / (containingDocuments + 0.5),
        );
        return (
          total +
          (idf * frequency * (BM25_K1 + 1)) /
            (frequency + BM25_K1 * (1 - BM25_B + BM25_B * (document.length / averageLength)))
        );
      }, 0);
      return { tool, score };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.tool.providerName.localeCompare(right.tool.providerName),
    )
    .map(({ tool }) => tool);
}

function tokenize(value: string): string[] {
  const normalized = value
    .replace(/([\p{Lu}]+)([\p{Lu}][\p{Ll}])/gu, '$1 $2')
    .replace(/([\p{Ll}\d])([\p{Lu}])/gu, '$1 $2')
    .toLowerCase();
  return normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
}

function toolToTypeScript(
  tool: RuntimeTool,
  maxCharacters = TOOL_DECLARATION_CHARACTER_LIMIT,
): string {
  const characterLimit = Math.max(
    MIN_TOOL_DECLARATION_CHARACTER_LIMIT,
    Math.min(TOOL_DECLARATION_CHARACTER_LIMIT, maxCharacters),
  );
  const description = docText(tool.description || tool.displayName || tool.providerName);
  if (!isJsonWithinCharacterLimit(tool.inputSchema, TOOL_SCHEMA_RENDER_CHARACTER_LIMIT)) {
    return genericToolDeclaration(tool, description, characterLimit);
  }
  const declaration = [
    'type McpToolResult = { value: unknown; artifacts: unknown[] }',
    `/** ${description} */`,
    'declare function tool_call(input: {',
    `  name: ${JSON.stringify(tool.providerName)};`,
    `  params: ${jsonSchemaToTypeScript(tool.inputSchema)};`,
    '}): Promise<McpToolResult>;',
  ].join('\n');
  if (declaration.length <= characterLimit) return declaration;
  return genericToolDeclaration(tool, description, characterLimit);
}

function genericToolDeclaration(
  tool: RuntimeTool,
  description: string,
  characterLimit: number,
): string {
  const fallback = [
    'type McpToolResult = { value: unknown; artifacts: unknown[] }',
    `/** ${description} Parameter schema omitted because it exceeds the catalog limit. */`,
    'declare function tool_call(input: {',
    `  name: ${JSON.stringify(tool.providerName)};`,
    '  params: Record<string, unknown>;',
    '}): Promise<McpToolResult>;',
  ].join('\n');
  if (fallback.length <= characterLimit) return fallback;
  return [
    'type McpToolResult = { value: unknown; artifacts: unknown[] }',
    'declare function tool_call(input: {',
    `  name: ${JSON.stringify(tool.providerName)};`,
    '  params: Record<string, unknown>;',
    '}): Promise<McpToolResult>;',
  ].join('\n');
}

function isJsonWithinCharacterLimit(value: RuntimeJsonValue, characterLimit: number): boolean {
  let remaining = characterLimit;
  const visit = (item: RuntimeJsonValue, depth: number): boolean => {
    if (item === null || typeof item === 'boolean' || typeof item === 'number') {
      remaining -= String(item).length;
      return remaining >= 0;
    }
    if (typeof item === 'string') {
      remaining -= item.length + 2;
      return remaining >= 0;
    }
    if (depth >= MAX_NESTING_DEPTH) return true;
    if (Array.isArray(item)) {
      remaining -= item.length + 2;
      return remaining >= 0 && item.every((child) => visit(child, depth + 1));
    }

    const entries = Object.entries(item);
    remaining -= entries.length + 2;
    return (
      remaining >= 0 &&
      entries.every(([key, child]) => {
        remaining -= key.length + 2;
        return remaining >= 0 && visit(child, depth + 1);
      })
    );
  };

  return visit(value, 0);
}

type SearchMatch = { name: string; description: string; declaration: string };

function boundedSearchResult(
  tools: readonly RuntimeTool[],
  requestedCharacterLimit: number,
): { matches: SearchMatch[]; output: RuntimeToolResult; truncated: boolean } {
  const characterLimit = Math.max(
    0,
    Math.min(SEARCH_RESULT_CHARACTER_LIMIT, Math.floor(requestedCharacterLimit)),
  );
  const matches: SearchMatch[] = [];
  let truncated = tools.length > SEARCH_RESULT_LIMIT;
  for (const tool of tools) {
    if (matches.length >= SEARCH_RESULT_LIMIT) break;
    const match = {
      name: tool.providerName,
      description: boundedText(
        tool.description,
        Math.min(TOOL_DESCRIPTION_CHARACTER_LIMIT, Math.max(1, Math.floor(characterLimit / 4))),
      ),
      declaration: toolToTypeScript(tool, Math.max(1, Math.floor(characterLimit / 2))),
    };
    const candidate = createSearchOutput([...matches, match], true);
    if (JSON.stringify(candidate).length > characterLimit) {
      truncated = true;
      continue;
    }
    matches.push(match);
  }

  let output = createSearchOutput(matches, truncated);
  while (matches.length > 0 && JSON.stringify(output).length > characterLimit) {
    matches.pop();
    truncated = true;
    output = createSearchOutput(matches, truncated);
  }
  return { matches, output, truncated };
}

function createSearchOutput(
  matches: readonly SearchMatch[],
  truncated: boolean,
): RuntimeToolResult {
  return {
    value: {
      matchedNamespaces: matches.length > 0 ? [{ namespace: 'mcp', tools: [...matches] }] : [],
      ...(truncated ? { truncated: true } : {}),
    },
    artifacts: [],
  };
}

function boundedDescribeResult(
  tool: RuntimeTool,
  requestedCharacterLimit: number,
): RuntimeToolResult {
  const characterLimit = Math.max(0, Math.floor(requestedCharacterLimit));
  const description = boundedText(tool.description, TOOL_DESCRIPTION_CHARACTER_LIMIT);
  const output: RuntimeToolResult = {
    value: {
      name: tool.providerName,
      description,
      declaration: toolToTypeScript(tool),
    },
    artifacts: [],
  };
  if (JSON.stringify(output).length <= characterLimit) return output;

  const fallback: RuntimeToolResult = {
    value: {
      name: tool.providerName,
      description: boundedText(description, 256),
      declaration: toolToTypeScript(tool, Math.max(1, characterLimit - 512)),
    },
    artifacts: [],
  };
  if (JSON.stringify(fallback).length <= characterLimit) return fallback;

  return {
    value: {
      name: tool.providerName,
      description: '',
      declaration: genericToolDeclaration(tool, '', MIN_TOOL_DECLARATION_CHARACTER_LIMIT),
    },
    artifacts: [],
  };
}

export function createPiDispatchActivityInput(input: unknown): RuntimeJsonValue {
  return isRecord(input) && typeof input.name === 'string'
    ? { name: boundedText(input.name, DISPATCH_ACTIVITY_NAME_CHARACTER_LIMIT) }
    : {};
}

function jsonSchemaToTypeScript(schema: unknown, depth = 0): string {
  return schemaToTypeScript(schema, schema, depth, new Set());
}

function schemaToTypeScript(
  schema: unknown,
  root: unknown,
  depth: number,
  resolvingRefs: ReadonlySet<string>,
): string {
  if (!isRecord(schema) || depth >= MAX_NESTING_DEPTH) return 'unknown';

  if (typeof schema.$ref === 'string') {
    const ref = schema.$ref;
    if (resolvingRefs.has(ref)) return 'unknown';
    const resolved = resolveLocalRef(root, ref);
    if (!resolved) return 'unknown';
    return schemaToTypeScript(resolved, root, depth + 1, new Set([...resolvingRefs, ref]));
  }

  if ('const' in schema) return literalType(schema.const);
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.map(literalType).join(' | ');
  }

  for (const unionKey of ['anyOf', 'oneOf'] as const) {
    const variants = schema[unionKey];
    if (Array.isArray(variants) && variants.length > 0) {
      return variants
        .map((variant) => schemaToTypeScript(variant, root, depth + 1, resolvingRefs))
        .join(' | ');
    }
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    return schema.allOf
      .map((variant) => schemaToTypeScript(variant, root, depth + 1, resolvingRefs))
      .join(' & ');
  }

  if (Array.isArray(schema.type)) {
    return schema.type
      .map((type) => schemaToTypeScript({ ...schema, type }, root, depth + 1, resolvingRefs))
      .join(' | ');
  }

  switch (schema.type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array':
      return `Array<${schemaToTypeScript(schema.items, root, depth + 1, resolvingRefs)}>`;
    case 'object':
    case undefined:
      return objectSchemaToTypeScript(schema, root, depth, resolvingRefs);
    default:
      return 'unknown';
  }
}

function objectSchemaToTypeScript(
  schema: Record<string, unknown>,
  root: unknown,
  depth: number,
  resolvingRefs: ReadonlySet<string>,
): string {
  if (!isRecord(schema.properties)) {
    return isRecord(schema.additionalProperties)
      ? `Record<string, ${schemaToTypeScript(schema.additionalProperties, root, depth + 1, resolvingRefs)}>`
      : 'Record<string, unknown>';
  }

  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((value): value is string => typeof value === 'string')
      : [],
  );
  const fields = Object.entries(schema.properties)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, property]) => {
      const description =
        isRecord(property) && typeof property.description === 'string'
          ? `/** ${docText(property.description)} */ `
          : '';
      return `${description}${quotePropertyName(name)}${required.has(name) ? '' : '?'}: ${schemaToTypeScript(property, root, depth + 1, resolvingRefs)}`;
    });
  return fields.length > 0 ? `{ ${fields.join('; ')} }` : 'Record<string, unknown>';
}

function resolveLocalRef(root: unknown, ref: string): unknown {
  if (!ref.startsWith('#/')) return undefined;
  return ref
    .slice(2)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce<unknown>((value, segment) => {
      if (!isRecord(value) || !(segment in value)) return undefined;
      return value[segment];
    }, root);
}

function quotePropertyName(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function literalType(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value) ?? 'unknown';
  }
  return 'unknown';
}

function docText(value: string): string {
  return boundedText(
    value.trim().split('\n')[0]?.replaceAll('*/', '*\\/') ?? '',
    TOOL_DESCRIPTION_CHARACTER_LIMIT,
  );
}

function boundedText(value: string, maxCharacters: number): string {
  return value.length > maxCharacters ? `${value.slice(0, maxCharacters - 1)}…` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
