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
  response: z.object({ $ref: z.string() }).optional(),
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
  parseInput(input: Record<string, unknown>): Record<string, unknown>;
  readResult(result: unknown): unknown;
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
    // The official shared skill uses identity whoami even though CLI help hides it.
    if (
      !parsed.success ||
      (parsed.data.hidden && serviceName !== 'identity') ||
      parsed.data.http_method.toUpperCase() !== 'POST'
    )
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
      url.pathname !== `/cli/${admitted.path.join('/')}`
    )
      throw new PluginError('request', 'Untrusted Wecom tool endpoint.');
    let schema: Record<string, unknown>;
    try {
      const request = service.schemas[method.request.$ref];
      if (!request) throw new PluginError('request', 'Missing Wecom request schema.');
      schema = resolveSchema(mobileInput(name, request), service.schemas);
    } catch (error) {
      if (error instanceof PluginError && error.reason === 'unavailable') continue;
      throw error;
    }
    if (schema.type !== 'object') throw new PluginError('request', 'Unsupported Wecom tool input.');
    const validator = z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0]);
    tools.push({
      path: url.pathname,
      effect: admitted.effect,
      definition: {
        name,
        description:
          name === 'wecom_doc_create'
            ? 'Create a text document with inline content.'
            : name === 'wecom_message_aibot_send'
              ? 'Send a Markdown text message as the authorized WeCom bot.'
              : (method.description ?? `${owner} ${segments.join(' ')}`),
        inputSchema: { ...schema, type: 'object' },
        annotations: { readOnlyHint: admitted.effect === 'read' },
      },
      parseInput(input) {
        const parsed = validator.safeParse(input);
        if (!parsed.success)
          throw new PluginError(
            'request',
            'Invalid Wecom arguments. File operations are not supported.',
          );
        return parsed.data as Record<string, unknown>;
      },
      readResult: (result) => inlineResult(result, method.response ?? {}, service.schemas),
    });
  }
  return tools;
}

/** Keep inline variants of mixed CLI methods; dedicated table tools own table creation. */
function mobileInput(name: string, schema: Record<string, unknown>): Record<string, unknown> {
  const properties = { ...parseWecomResponse(ObjectSchema, schema.properties ?? {}) };
  if (name === 'wecom_doc_create') {
    for (const key of Object.keys(properties))
      if (!['doc_name', 'doc_type', 'content', 'content_type'].includes(key))
        delete properties[key];
    properties.doc_type = {
      ...parseWecomResponse(ObjectSchema, properties.doc_type),
      enum: ['doc'],
    };
  }
  if (name === 'wecom_mail_send') {
    delete properties.attachments;
    delete properties.inline_images;
  }
  if (['wecom_doc_create', 'wecom_doc_contents_overwrite', 'wecom_mail_send'].includes(name)) {
    properties.content = {
      ...parseWecomResponse(ObjectSchema, properties.content),
      description: 'Inline text content in the format selected by content_type.',
    };
  }
  if (name === 'wecom_message_aibot_send') {
    for (const key of ['file', 'image', 'voice', 'video']) delete properties[key];
    properties.msg_type = { type: 'string', enum: ['markdown'] };
    return { ...schema, properties, required: ['chat_id', 'msg_type', 'markdown'] };
  }
  return { ...schema, properties };
}

function resolveSchema(
  input: Record<string, unknown>,
  schemas: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  const definitions: Record<string, Record<string, unknown>> = {};
  const resolving = new Set<string>();

  function convert(input: Record<string, unknown>, depth = 0): Record<string, unknown> {
    if (depth > 64) throw new PluginError('request', 'Wecom tool schema is too deeply nested.');
    if (
      input.hidden === true ||
      ['x-wecom-hidden', 'x-wecom-file-upload', 'x-wecom-octet-stream'].some((key) =>
        enabledDirective(input[key]),
      )
    )
      throw new PluginError('unavailable', 'This Wecom input requires file handling.');

    const result = { ...input };
    for (const key of Object.keys(result)) if (key.startsWith('x-wecom-')) delete result[key];
    if (typeof input.$ref === 'string') {
      const name = input.$ref;
      if (!Object.hasOwn(schemas, name))
        throw new PluginError('request', 'Unsupported Wecom schema reference.');
      if (!Object.hasOwn(definitions, name) && !resolving.has(name)) {
        resolving.add(name);
        try {
          definitions[name] = convert(schemas[name], depth + 1);
        } finally {
          resolving.delete(name);
        }
      }
      // Standard local references retain recursive formula schemas without expanding forever.
      result.$ref = `#/$defs/${name.replaceAll('~', '~0').replaceAll('/', '~1')}`;
    }
    if (input.properties) {
      const properties = parseWecomResponse(ObjectSchema, input.properties);
      const required = Array.isArray(input.required) ? input.required : [];
      const visible: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(properties)) {
        try {
          if (['file_path', 'content_path'].includes(key))
            throw new PluginError('unavailable', 'Local files are not supported.');
          visible[key] = convert(parseWecomResponse(ObjectSchema, value), depth + 1);
        } catch (error) {
          if (
            !(error instanceof PluginError) ||
            error.reason !== 'unavailable' ||
            required.includes(key)
          )
            throw error;
        }
      }
      result.properties = visible;
      // Reject omitted file fields at invocation too, including within nested objects.
      result.additionalProperties = false;
    }
    for (const key of input.properties ? ['items'] : ['items', 'additionalProperties']) {
      if (typeof input[key] === 'object' && input[key] !== null)
        result[key] = convert(parseWecomResponse(ObjectSchema, input[key]), depth + 1);
    }
    for (const key of ['oneOf', 'anyOf', 'allOf']) {
      if (Array.isArray(input[key]))
        result[key] = input[key].map((item) =>
          convert(parseWecomResponse(ObjectSchema, item), depth + 1),
        );
    }
    return result;
  }

  const result = convert(input);
  if (Object.keys(definitions).length) result.$defs = definitions;
  return result;
}

function enabledDirective(value: unknown) {
  return value === true || (typeof value === 'object' && value !== null);
}

/** CLI file-save fields contain inline content before its filesystem postprocessor runs. */
function inlineResult(
  value: unknown,
  input: Record<string, unknown>,
  schemas: Record<string, Record<string, unknown>>,
  depth = 0,
): unknown {
  if (depth > 64) throw new PluginError('request', 'Wecom result is too deeply nested.');
  const schema = typeof input.$ref === 'string' ? (schemas[input.$ref] ?? {}) : input;
  if (Array.isArray(value)) {
    const items = ObjectSchema.safeParse(schema.items);
    return value.map((item) =>
      inlineResult(item, items.success ? items.data : {}, schemas, depth + 1),
    );
  }
  if (typeof value !== 'object' || value === null) return value;
  const properties = ObjectSchema.safeParse(schema.properties);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      const property = ObjectSchema.safeParse(
        properties.success ? properties.data[key] : undefined,
      );
      const child = property.success ? property.data : {};
      if (enabledDirective(child['x-wecom-file-save']))
        return ['inline_content', readInlineContent(item, child['x-wecom-file-save'])];
      return [key, inlineResult(item, child, schemas, depth + 1)];
    }),
  );
}

function readInlineContent(value: unknown, directive: unknown): string {
  const payload =
    typeof value === 'string'
      ? { content: value, content_encoding: undefined }
      : parseWecomResponse(
          z.object({ content: z.string(), content_encoding: z.string().optional() }),
          value,
        );
  const options = ObjectSchema.safeParse(directive);
  const encoding =
    payload.content_encoding ?? (options.success ? options.data.contentEncoding : undefined);
  if (encoding !== 'base64') return payload.content;
  try {
    const bytes = Uint8Array.from(atob(payload.content), (character) => character.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new PluginError('request', 'Wecom returned invalid inline text.');
  }
}
