import type { ListToolsResult } from '@ai-sdk/mcp';
import * as z from 'zod';

import { PluginError } from '@/shared/contracts/plugins';

import { getWecomToolEffect } from './wecomTools';

export type WecomJsonSchema = Record<string, unknown>;
export type WecomEndpoint = { path: string; method: 'POST'; rangeSize?: number };
export type WecomTool = {
  definition: ListToolsResult['tools'][number];
  endpoint: WecomEndpoint;
  request: WecomJsonSchema;
  response?: WecomJsonSchema;
  effect: 'read' | 'write';
};

const segment = z
  .string()
  .max(64)
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/)
  .refine((s) => !s.includes('__'));
export const WecomCatalogSchema = z.object({
  items: z.array(z.object({ name: segment, hidden: z.boolean().optional() })).max(64),
});
const schemaObject = z.record(z.string(), z.unknown());
const resourceSchema = z.object({
  hidden: z.boolean().optional(),
  methods: z.record(segment, z.unknown()).default({}),
  resources: z.record(segment, z.unknown()).default({}),
});
const serviceSchema = resourceSchema.extend({
  base_url: z.string().optional(),
  schemas: z.record(z.string(), schemaObject).default({}),
});
const methodSchema = z.object({
  hidden: z.boolean().optional(),
  description: z.string().max(32_768).optional(),
  base_url: z.string().optional(),
  path: z.string().min(1).max(2048),
  http_method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  range_size: z.number().int().nonnegative().optional(),
  request: z.object({ $ref: z.string() }).nullish(),
  response: z.object({ $ref: z.string() }).nullish(),
});

export function isWecomApiUrl(url: URL): boolean {
  return (
    url.origin === 'https://qyapi.weixin.qq.com' &&
    /^\/cli\/[a-zA-Z0-9_./-]+$/.test(url.pathname) &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password
  );
}

function endpoint(base: string, path: string, rangeSize?: number): WecomEndpoint {
  const raw = `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  if (/[\\%]/.test(raw) || raw.split('/').some((part) => part === '..' || part === '.'))
    throw new PluginError('request', 'Invalid Wecom service path.');
  const url = new URL(raw);
  if (!isWecomApiUrl(url)) throw new PluginError('access', 'Untrusted Wecom service endpoint.');
  // CLI gateway invocation always POSTs, including methods described as reads in the schema.
  return { path: url.pathname, method: 'POST', rangeSize: rangeSize || undefined };
}

export function isWecomDirective(value: unknown): boolean {
  return value === true || (!!value && typeof value === 'object' && !Array.isArray(value));
}

/** The CLI uses named schema references, including references within object/array/union fields. */
export function resolveWecomSchema(
  input: WecomJsonSchema,
  definitions: Record<string, WecomJsonSchema>,
  ancestors: readonly string[] = [],
  depth = 0,
): WecomJsonSchema {
  if (depth > 32) throw new PluginError('request', 'Wecom schema is too deeply nested.');
  let schema = input;
  if (typeof input.$ref === 'string') {
    if (ancestors.includes(input.$ref) || !Object.hasOwn(definitions, input.$ref))
      throw new PluginError('request', 'Unresolved or recursive Wecom schema reference.');
    const { $ref, ...own } = input;
    schema = {
      ...resolveWecomSchema(definitions[$ref], definitions, [...ancestors, $ref], depth + 1),
      ...own,
    };
  }
  const result = { ...schema };
  if (
    schema.properties &&
    typeof schema.properties === 'object' &&
    !Array.isArray(schema.properties)
  )
    result.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, child]) => [
        key,
        resolveWecomSchema(schemaObject.parse(child), definitions, ancestors, depth + 1),
      ]),
    );
  if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items))
    result.items = resolveWecomSchema(
      schemaObject.parse(schema.items),
      definitions,
      ancestors,
      depth + 1,
    );
  for (const key of ['oneOf', 'anyOf', 'allOf'])
    if (Array.isArray(schema[key])) {
      result[key] = schema[key].map((child) =>
        resolveWecomSchema(schemaObject.parse(child), definitions, ancestors, depth + 1),
      );
      // File directives need an unambiguous field path; do not silently send a local URI
      // when a branch-dependent directive cannot be applied by the native file adapter.
      if (
        (result[key] as WecomJsonSchema[]).some((child) =>
          hasWecomDirective(child, [
            'x-wecom-file-upload',
            'x-wecom-octet-stream',
            'x-wecom-file-save',
          ]),
        )
      )
        throw new PluginError('request', 'Unsupported Wecom file directive in a schema union.');
    }
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object')
    result.additionalProperties = resolveWecomSchema(
      schemaObject.parse(schema.additionalProperties),
      definitions,
      ancestors,
      depth + 1,
    );
  return result;
}

/** Keep runtime directives privately; expose the CLI's visible input fields to the model. */
function modelSchema(schema: WecomJsonSchema): WecomJsonSchema {
  const result = Object.fromEntries(
    Object.entries(schema).filter(([key]) => !key.startsWith('x-wecom-')),
  );
  if (
    isWecomDirective(schema['x-wecom-file-upload']) ||
    isWecomDirective(schema['x-wecom-octet-stream'])
  )
    result.description = `${typeof schema.description === 'string' ? `${schema.description}\n` : ''}Supply the file_entry_id from a Cherry attachment/file tool, or a local Cherry export/Wecom download path. Cherry uploads the file contents.`;
  if (schema.properties && typeof schema.properties === 'object') {
    const properties = Object.entries(schema.properties).filter(
      ([, child]) => !isWecomDirective(child['x-wecom-hidden']),
    );
    result.properties = Object.fromEntries(
      properties.map(([key, child]) => [key, modelSchema(child)]),
    );
    if (Array.isArray(schema.required))
      result.required = schema.required.filter((key) =>
        Object.hasOwn(result.properties as object, key),
      );
  }
  if (schema.items && typeof schema.items === 'object')
    result.items = modelSchema(schema.items as WecomJsonSchema);
  for (const key of ['oneOf', 'anyOf', 'allOf'])
    if (Array.isArray(schema[key])) result[key] = schema[key].map(modelSchema);
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object')
    result.additionalProperties = modelSchema(schema.additionalProperties as WecomJsonSchema);
  return result;
}

export function hasWecomDirective(schema: WecomJsonSchema, names: readonly string[]): boolean {
  if (names.some((key) => isWecomDirective(schema[key]))) return true;
  return Object.values(schema).some((value) =>
    Array.isArray(value)
      ? value.some((child) => child && typeof child === 'object' && hasWecomDirective(child, names))
      : !!value && typeof value === 'object' && hasWecomDirective(value as WecomJsonSchema, names),
  );
}

export function readWecomService(
  name: string,
  value: unknown,
): { tools: WecomTool[]; warnings: string[] } {
  segment.parse(name);
  const service = serviceSchema.parse(value);
  const tools: WecomTool[] = [];
  const warnings: string[] = [];
  function visit(value: unknown, path: string[], depth: number) {
    if (depth > 8) throw new PluginError('request', 'Wecom resource tree is too deeply nested.');
    const resource = resourceSchema.parse(value);
    if (resource.hidden) return;
    for (const [methodName, data] of Object.entries(resource.methods)) {
      const methodPath = [...path, methodName];
      const toolName = `wecom_${name}__${methodPath.join('__')}`;
      try {
        const method = methodSchema.parse(data);
        if (method.hidden) continue;
        const effect = getWecomToolEffect(toolName);
        if (!effect) throw new Error('Invalid tool name');
        const request = method.request
          ? resolveWecomSchema(method.request, service.schemas)
          : { type: 'object', properties: {} };
        if (request.type !== 'object') throw new Error('Expected object input');
        if (
          effect === 'read' &&
          hasWecomDirective(request, [
            'x-wecom-file-upload',
            'x-wecom-octet-stream',
            'x-wecom-confirm',
          ])
        )
          throw new Error('Read tool gained write directives');
        const response = method.response
          ? resolveWecomSchema(method.response, service.schemas)
          : undefined;
        tools.push({
          endpoint: endpoint(
            method.base_url ?? service.base_url ?? 'https://qyapi.weixin.qq.com/cli',
            method.path,
            method.range_size,
          ),
          request,
          response,
          effect,
          definition: {
            name: toolName,
            description: method.description ?? `${name} ${methodPath.join(' ')}`,
            inputSchema: { ...modelSchema(request), type: 'object' },
            annotations: { readOnlyHint: effect === 'read', destructiveHint: effect === 'write' },
          },
        });
      } catch {
        warnings.push(
          `Wecom ${name} ${methodPath.join(' ')} has an unsupported interface definition.`,
        );
      }
      if (tools.length > 1024) throw new PluginError('request', 'Wecom returned too many tools.');
    }
    for (const [child, value] of Object.entries(resource.resources))
      visit(value, [...path, child], depth + 1);
  }
  visit(service, [], 0);
  return { tools, warnings };
}
