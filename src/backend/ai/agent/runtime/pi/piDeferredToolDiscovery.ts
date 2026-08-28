import type { RuntimeJsonValue, RuntimeTool, RuntimeToolCall, RuntimeToolResult } from '../types';

export const PI_TOOL_SEARCH_TOOL_NAME = 'tool_search';
export const PI_TOOL_DESCRIBE_TOOL_NAME = 'tool_describe';
export const PI_TOOL_CALL_TOOL_NAME = 'tool_call';

export const PI_DEFERRED_TOOL_DISCOVERY_SYSTEM_PROMPT = `MCP tools are available through a searchable catalog.
Use tool_search to discover relevant tools and their TypeScript signatures.
Use tool_describe when you need the complete signature for one exact tool name.
Use tool_call with an exact discovered name and params matching that signature.
Do not guess tool names or parameters.`;

const SEARCH_RESULT_LIMIT = 20;
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
  call: RuntimeToolCall,
  catalogCallInput: RuntimeJsonValue,
) => Promise<RuntimeToolResult>;

/**
 * Project one frozen MCP catalog into three provider-independent tools for
 * deferred tool discovery. The caller owns the actual target invocation so it
 * can re-enter the mobile Runtime's approval, cancellation, and event boundary.
 */
export function createPiDeferredToolDiscoveryTools(
  tools: readonly RuntimeTool[],
  invokeTarget: InvokeTargetTool,
): RuntimeTool[] {
  const catalog = new Map(tools.map((tool) => [tool.providerName, tool]));

  const searchTool: RuntimeTool = {
    ref: { source: 'builtin', capabilityId: PI_TOOL_SEARCH_TOOL_NAME },
    providerName: PI_TOOL_SEARCH_TOOL_NAME,
    displayName: 'Search tools',
    description:
      'Search the available MCP tool catalog. Returns matching names, descriptions, and TypeScript signatures for use with tool_call.',
    inputSchema: SEARCH_INPUT_SCHEMA,
    approval: 'auto',
    async execute({ input }) {
      const query = isRecord(input) && typeof input.query === 'string' ? input.query : '';
      const matches = rankTools([...catalog.values()], query)
        .slice(0, SEARCH_RESULT_LIMIT)
        .map((tool) => ({
          name: tool.providerName,
          description: tool.description,
          declaration: toolToTypeScript(tool),
        }));

      return {
        value: {
          matchedNamespaces: matches.length > 0 ? [{ namespace: 'mcp', tools: matches }] : [],
        },
        artifacts: [],
      };
    },
  };

  const describeTool: RuntimeTool = {
    ref: { source: 'builtin', capabilityId: PI_TOOL_DESCRIBE_TOOL_NAME },
    providerName: PI_TOOL_DESCRIBE_TOOL_NAME,
    displayName: 'Describe tool',
    description: 'Get the complete description and TypeScript signature for one discovered tool.',
    inputSchema: DESCRIBE_INPUT_SCHEMA,
    approval: 'auto',
    async execute({ input }) {
      const name = isRecord(input) && typeof input.name === 'string' ? input.name : '';
      const tool = catalog.get(name);
      if (!tool) throw new Error(`Tool not found: ${name}`);
      return {
        value: {
          name: tool.providerName,
          description: tool.description,
          declaration: toolToTypeScript(tool),
        },
        artifacts: [],
      };
    },
  };

  const callTool: RuntimeTool = {
    ref: { source: 'builtin', capabilityId: PI_TOOL_CALL_TOOL_NAME },
    providerName: PI_TOOL_CALL_TOOL_NAME,
    displayName: 'Call tool',
    description:
      'Call one MCP tool using an exact name and params matching a signature returned by tool_search or tool_describe.',
    inputSchema: CALL_INPUT_SCHEMA,
    approval: 'auto',
    async execute(call) {
      const input = isRecord(call.input) ? call.input : {};
      const name = typeof input.name === 'string' ? input.name : '';
      const params = isRecord(input.params) ? input.params : {};
      const tool = catalog.get(name);
      if (!tool) throw new Error(`Tool not found: ${name}`);
      return invokeTarget(tool, { ...call, input: params }, call.input);
    },
  };

  return [searchTool, describeTool, callTool];
}

function rankTools(tools: readonly RuntimeTool[], query: string): RuntimeTool[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [...tools];

  const documents = tools.map((tool) => tokenize(`${tool.providerName} ${tool.description}`));
  const averageLength =
    documents.reduce((sum, document) => sum + document.length, 0) / documents.length || 1;
  const documentFrequency = new Map<string, number>();
  for (const document of documents) {
    for (const term of document) {
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
  return [...new Set(normalized.match(/[\p{L}\p{N}]+/gu) ?? [])];
}

function toolToTypeScript(tool: RuntimeTool): string {
  const description = docText(tool.description || tool.displayName || tool.providerName);
  return [
    'type McpToolResult = { value: unknown; artifacts: unknown[] }',
    `/** ${description} */`,
    'declare function tool_call(input: {',
    `  name: ${JSON.stringify(tool.providerName)};`,
    `  params: ${jsonSchemaToTypeScript(tool.inputSchema)};`,
    '}): Promise<McpToolResult>;',
  ].join('\n');
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
  return value.trim().split('\n')[0]?.replaceAll('*/', '*\\/') ?? '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
