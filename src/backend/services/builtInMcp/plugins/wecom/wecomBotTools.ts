import type { ListToolsResult } from '@ai-sdk/mcp';
import * as z from 'zod';

import { PluginError } from '@/shared/contracts/plugins';

import { parseWecomResponse } from './wecomBotApi';
import { WECOM_BOT_METHODS } from './wecomTools';

const ObjectSchema = z.record(z.string(), z.unknown());
const MethodSchema = z.object({
  path: z.string(),
  http_method: z.string(),
  base_url: z.string().nullish(),
  description: z.string().optional(),
  hidden: z.boolean().optional(),
  request: z.object({ $ref: z.string() }),
});
const ServiceSchema = z
  .object({
    base_url: z.string().nullish(),
    schemas: z.record(z.string(), ObjectSchema),
  })
  .loose();

export type WecomBotTool = {
  definition: ListToolsResult['tools'][number];
  path: string;
  effect: 'read' | 'write';
};

/** Converts only locally admitted JSON methods. Filesystem directives are never executed. */
export function getWecomBotTools(serviceName: string, value: unknown): WecomBotTool[] {
  const service = parseWecomResponse(ServiceSchema, value);
  const tools: WecomBotTool[] = [];
  for (const [name, admitted] of Object.entries(WECOM_BOT_METHODS)) {
    const [owner, ...segments] = admitted.path;
    if (owner !== serviceName) continue;
    let resource: Record<string, unknown> = service;
    for (const segment of segments.slice(0, -1)) {
      const children = ObjectSchema.safeParse(resource.resources);
      const child = ObjectSchema.safeParse(children.success ? children.data[segment] : undefined);
      if (!child.success || child.data.hidden === true) {
        resource = {};
        break;
      }
      resource = child.data;
    }
    const methods = ObjectSchema.safeParse(resource.methods);
    const parsed = MethodSchema.safeParse(
      methods.success ? methods.data[segments.at(-1)!] : undefined,
    );
    if (!parsed.success || parsed.data.hidden || parsed.data.http_method.toUpperCase() !== 'POST')
      continue;
    const method = parsed.data;
    const base = method.base_url ?? service.base_url ?? 'https://qyapi.weixin.qq.com/cli';
    let url: URL;
    try {
      if (!/^\/?[A-Za-z0-9/_-]+$/.test(method.path)) throw new Error('Invalid path');
      url = new URL(`${base.replace(/\/$/, '')}/${method.path.replace(/^\//, '')}`);
    } catch {
      throw new PluginError('request', 'Invalid Wecom tool endpoint.');
    }
    if (
      url.origin !== 'https://qyapi.weixin.qq.com' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/cli\/[A-Za-z0-9/_-]+$/.test(url.pathname)
    )
      throw new PluginError('request', 'Untrusted Wecom tool endpoint.');
    let schema: Record<string, unknown>;
    try {
      schema = resolveSchema(method.request, service.schemas);
    } catch (error) {
      if (error instanceof PluginError && error.reason === 'unavailable') continue;
      throw error;
    }
    if (schema.type !== 'object') throw new PluginError('request', 'Unsupported Wecom tool input.');
    tools.push({
      path: url.pathname,
      effect: admitted.effect,
      definition: {
        name,
        description: method.description ?? `${owner} ${segments.join(' ')}`,
        inputSchema: { ...schema, type: 'object' },
        annotations: { readOnlyHint: admitted.effect === 'read' },
      },
    });
  }
  return tools;
}

function resolveSchema(
  input: Record<string, unknown>,
  schemas: Record<string, Record<string, unknown>>,
  references = new Set<string>(),
  depth = 0,
): Record<string, unknown> {
  if (depth > 24) throw new PluginError('request', 'Wecom tool schema is too deeply nested.');
  let schema = input;
  if (typeof schema.$ref === 'string') {
    const name = schema.$ref;
    if (!Object.hasOwn(schemas, name) || references.has(name))
      throw new PluginError('request', 'Unsupported Wecom schema reference.');
    const { $ref: _ref, ...overrides } = schema;
    schema = {
      ...resolveSchema(schemas[name], schemas, new Set([...references, name]), depth + 1),
      ...overrides,
    };
  }
  const result: Record<string, unknown> = { ...schema };
  if (['x-wecom-file-upload', 'x-wecom-octet-stream'].some((key) => enabledDirective(schema[key])))
    throw new PluginError('unavailable', 'This Wecom method requires unsupported file handling.');
  for (const key of Object.keys(result)) if (key.startsWith('x-wecom-')) delete result[key];
  // Upstream's JSON request schema uses bare named references; expand them for MCP consumers.
  if (schema.properties) {
    const properties = parseWecomResponse(ObjectSchema, schema.properties);
    const visible = Object.entries(properties)
      .map(([key, value]) => [key, parseWecomResponse(ObjectSchema, value)] as const)
      .filter(([, property]) => !enabledDirective(property['x-wecom-hidden']));
    result.properties = Object.fromEntries(
      visible.map(([key, value]) => [key, resolveSchema(value, schemas, references, depth + 1)]),
    );
    if (Array.isArray(schema.required)) {
      const names = new Set(visible.map(([key]) => key));
      result.required = schema.required.filter(
        (name) => typeof name === 'string' && names.has(name),
      );
    }
  }
  for (const key of ['items', 'additionalProperties']) {
    if (typeof schema[key] === 'object' && schema[key] !== null)
      result[key] = resolveSchema(
        parseWecomResponse(ObjectSchema, schema[key]),
        schemas,
        references,
        depth + 1,
      );
  }
  for (const key of ['oneOf', 'anyOf', 'allOf']) {
    if (Array.isArray(schema[key]))
      result[key] = schema[key].map((item) =>
        resolveSchema(parseWecomResponse(ObjectSchema, item), schemas, references, depth + 1),
      );
  }
  return result;
}

function enabledDirective(value: unknown) {
  return value === true || (typeof value === 'object' && value !== null);
}
