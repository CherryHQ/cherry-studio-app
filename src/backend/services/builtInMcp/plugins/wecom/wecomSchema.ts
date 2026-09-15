import type { ListToolsResult } from '@ai-sdk/mcp';
import * as z from 'zod';

import { PluginError } from '@/shared/contracts/plugins';

import { getWecomToolEffect } from './wecomTools';

export type WecomJsonSchema = Record<string, unknown>;
export type WecomEndpoint = { path: string; rangeSize?: number };
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
  return { path: url.pathname, rangeSize: rangeSize || undefined };
}

export function isWecomDirective(value: unknown): boolean {
  return value === true || (!!value && typeof value === 'object' && !Array.isArray(value));
}

/** Expand aliases at one node; recursion through child fields is handled by local references. */
function resolveNamedSchema(
  input: WecomJsonSchema,
  definitions: Record<string, WecomJsonSchema>,
): WecomJsonSchema {
  let schema = input;
  const aliases = new Set<string>();
  while (typeof schema.$ref === 'string') {
    const { $ref, ...own } = schema;
    if (aliases.has($ref) || !Object.hasOwn(definitions, $ref))
      throw new PluginError('request', 'Unresolved or recursive Wecom schema reference.');
    aliases.add($ref);
    schema = { ...definitions[$ref], ...own };
  }
  return schema;
}

/** Convert the CLI's named references to a finite JSON Schema, including recursive definitions. */
export function resolveWecomSchema(
  input: WecomJsonSchema,
  definitions: Record<string, WecomJsonSchema>,
): WecomJsonSchema {
  const references = new Map<string, string>();
  const localDefinitions: Record<string, WecomJsonSchema> = {};
  const unionBranches: WecomJsonSchema[] = [];
  function visit(schema: WecomJsonSchema, depth: number): WecomJsonSchema {
    if (depth > 32) throw new PluginError('request', 'Wecom schema is too deeply nested.');
    if (typeof schema.$ref === 'string') {
      // References may override fields/metadata. Give each variant its own definition so
      // validators that ignore $ref siblings still receive all of those constraints.
      const identity = JSON.stringify(schema);
      let name = references.get(identity);
      if (!name) {
        name = `schema${references.size}`;
        references.set(identity, name);
        localDefinitions[name] = visit(resolveNamedSchema(schema, definitions), 0);
      }
      return { $ref: `#/$defs/${name}` };
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
          visit(schemaObject.parse(child), depth + 1),
        ]),
      );
    if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items))
      result.items = visit(schemaObject.parse(schema.items), depth + 1);
    for (const key of ['oneOf', 'anyOf', 'allOf'])
      if (Array.isArray(schema[key])) {
        const branches = schema[key].map((child) => visit(schemaObject.parse(child), depth + 1));
        result[key] = branches;
        unionBranches.push(...branches);
      }
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object')
      result.additionalProperties = visit(
        schemaObject.parse(schema.additionalProperties),
        depth + 1,
      );
    return result;
  }
  const result = visit(resolveNamedSchema(input, definitions), 0);
  if (references.size) result.$defs = localDefinitions;
  // Check after all definitions exist, following references without expanding cycles.
  // Branch-dependent file directives still need an unambiguous field path.
  if (
    unionBranches.some((branch) =>
      hasWecomDirective(
        branch,
        ['x-wecom-file-upload', 'x-wecom-octet-stream', 'x-wecom-file-save'],
        result,
      ),
    )
  )
    throw new PluginError('request', 'Unsupported Wecom file directive in a schema union.');
  return result;
}

/** Resolve a generated local reference without walking its children. */
export function dereferenceWecomSchema(
  schema: WecomJsonSchema,
  root: WecomJsonSchema,
): WecomJsonSchema {
  if (typeof schema.$ref !== 'string') return schema;
  const definitions = root.$defs as Record<string, WecomJsonSchema> | undefined;
  const name = schema.$ref.slice('#/$defs/'.length);
  if (!schema.$ref.startsWith('#/$defs/') || !definitions || !Object.hasOwn(definitions, name))
    throw new PluginError('request', 'Unresolved Wecom schema reference.');
  return definitions[name];
}

/** Keep runtime directives privately; expose the CLI's visible input fields to the model. */
function modelSchema(schema: WecomJsonSchema, root = schema): WecomJsonSchema {
  const node = dereferenceWecomSchema(schema, root);
  const result = Object.fromEntries(
    Object.entries(schema).filter(([key]) => !key.startsWith('x-wecom-')),
  );
  // The tool catalog renders field descriptions beside references, without expanding definitions.
  if (typeof node.description === 'string') result.description = node.description;
  if (
    isWecomDirective(node['x-wecom-file-upload']) ||
    isWecomDirective(node['x-wecom-octet-stream'])
  )
    result.description = `${typeof node.description === 'string' ? `${node.description}\n` : ''}Supply the file_entry_id from a Cherry attachment/file tool, or a local Cherry export/Wecom download path. Cherry uploads the file contents.`;
  if (schema.properties && typeof schema.properties === 'object') {
    const properties = Object.entries(schema.properties).filter(
      ([, child]) => !isWecomDirective(dereferenceWecomSchema(child, root)['x-wecom-hidden']),
    );
    result.properties = Object.fromEntries(
      properties.map(([key, child]) => [key, modelSchema(child, root)]),
    );
    if (Array.isArray(schema.required))
      result.required = schema.required.filter((key) =>
        Object.hasOwn(result.properties as object, key),
      );
  }
  if (schema.items && typeof schema.items === 'object')
    result.items = modelSchema(schema.items as WecomJsonSchema, root);
  for (const key of ['oneOf', 'anyOf', 'allOf'])
    if (Array.isArray(schema[key]))
      result[key] = schema[key].map((child) => modelSchema(child, root));
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object')
    result.additionalProperties = modelSchema(schema.additionalProperties as WecomJsonSchema, root);
  if (schema.$defs && typeof schema.$defs === 'object')
    result.$defs = Object.fromEntries(
      Object.entries(schema.$defs).map(([key, child]) => [key, modelSchema(child, root)]),
    );
  return result;
}

export function hasWecomDirective(
  schema: WecomJsonSchema,
  names: readonly string[],
  root = schema,
): boolean {
  const visited = new Set<WecomJsonSchema>();
  function visit(schema: WecomJsonSchema): boolean {
    const node = dereferenceWecomSchema(schema, root);
    if (visited.has(node)) return false;
    visited.add(node);
    if (names.some((key) => isWecomDirective(node[key]))) return true;
    const children = [
      ...Object.values((node.properties as Record<string, unknown> | undefined) ?? {}),
      node.items,
      node.additionalProperties,
      ...['oneOf', 'anyOf', 'allOf'].flatMap((key) => (Array.isArray(node[key]) ? node[key] : [])),
    ];
    return children.some(
      (child) => !!child && typeof child === 'object' && visit(child as WecomJsonSchema),
    );
  }
  return visit(schema);
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
