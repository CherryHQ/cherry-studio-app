import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { fileEntryService } from '@/backend/data/services/FileEntryService';
import { getFileUri } from '@/backend/services/file/fileStorage';
import { PluginError } from '@/shared/contracts/plugins';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import { readWecomResult, type createWecomApi } from './wecomApi';
import {
  dereferenceWecomSchema,
  hasWecomDirective,
  isWecomDirective,
  type WecomJsonSchema,
} from './wecomSchema';

type FieldPath = (string | number)[];
type Field = { path: FieldPath; schema: WecomJsonSchema; value: unknown };
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const outputDirectory = () => new Directory(Paths.cache, 'WecomFiles');

function fields(
  schema: WecomJsonSchema,
  value: unknown,
  path: FieldPath = [],
  root = schema,
): Field[] {
  schema = dereferenceWecomSchema(schema, root);
  const result: Field[] = [{ path, schema, value }];
  if (Array.isArray(value) && schema.items && typeof schema.items === 'object')
    value.forEach((item, index) =>
      result.push(...fields(schema.items as WecomJsonSchema, item, [...path, index], root)),
    );
  else if (value && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties as Record<string, WecomJsonSchema> | undefined;
    for (const [key, item] of Object.entries(value)) {
      const child =
        properties && Object.hasOwn(properties, key)
          ? properties[key]
          : schema.additionalProperties;
      if (child && typeof child === 'object')
        result.push(...fields(child as WecomJsonSchema, item, [...path, key], root));
    }
  }
  return result;
}

function replace(value: unknown, path: FieldPath, replacement: unknown): unknown {
  if (!path.length) return replacement;
  let parent = value as Record<string | number, unknown>;
  for (const part of path.slice(0, -1)) parent = parent[part] as Record<string | number, unknown>;
  parent[path[path.length - 1]] = replacement;
  return value;
}

function fieldName(path: FieldPath): string {
  return path.reduce<string>(
    (name, part) =>
      typeof part === 'number' ? `${name}[${part}]` : `${name ? `${name}.` : ''}${part}`,
    '',
  );
}

async function uploadFile(value: string): Promise<File> {
  const id = FileEntryIdSchema.safeParse(value);
  const uri = id.success ? await getFileUri(fileEntryService, id.data) : value;
  if (!uri) throw new PluginError('request', 'The Cherry attachment is no longer available.');
  // These locations contain user attachments, document exports and prior Wecom downloads.
  // Never interpret a model-supplied path as permission to upload app databases/configuration.
  const roots = [
    new Directory(Paths.document, 'Data', 'Files'),
    new Directory(Paths.cache, 'DocumentExport'),
    outputDirectory(),
  ];
  let url: URL;
  try {
    url = new URL(uri.startsWith('/') ? `file://${uri}` : uri);
  } catch {
    throw new PluginError('request', 'Supply a local Cherry attachment or exported file.');
  }
  if (
    url.protocol !== 'file:' ||
    url.host ||
    url.search ||
    url.hash ||
    /%2f|%5c|%00/i.test(url.pathname) ||
    !roots.some((root) => url.href.startsWith(`${root.uri.replace(/\/$/, '')}/`))
  )
    throw new PluginError(
      'access',
      'Only Cherry attachments, exports and Wecom downloads can be uploaded.',
    );
  const file = new File(url.href);
  if (
    !file.exists ||
    !Number.isSafeInteger(file.size) ||
    file.size < 0 ||
    file.size > MAX_FILE_BYTES
  )
    throw new PluginError('request', 'Wecom upload is missing or exceeds 100 MiB.');
  return file;
}

/** Native files replace the CLI's local file directives; the service owns all business fields. */
export async function prepareWecomFiles(
  api: ReturnType<typeof createWecomApi>,
  schema: WecomJsonSchema,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<{ payload: Record<string, unknown>; form?: () => FormData }> {
  let payload = JSON.parse(JSON.stringify(args)) as Record<string, unknown>;
  const uploads = fields(schema, payload).filter(
    ({ schema, value }) =>
      typeof value === 'string' &&
      (isWecomDirective(schema['x-wecom-file-upload']) ||
        isWecomDirective(schema['x-wecom-octet-stream'])),
  );
  // Validate every file before the first upload, then reuse IDs for repeated file references.
  const files = new Map<string, File>();
  for (const { value } of uploads) {
    signal.throwIfAborted();
    if (!files.has(value as string)) files.set(value as string, await uploadFile(value as string));
  }
  signal.throwIfAborted();
  const multipartBytes = uploads
    .filter(({ schema }) => isWecomDirective(schema['x-wecom-octet-stream']))
    .reduce((size, { value }) => size + files.get(value as string)!.size, 0);
  if (multipartBytes > MAX_FILE_BYTES)
    throw new PluginError('request', 'Wecom multipart upload exceeds 100 MiB.');
  const mediaIds = new Map<string, string>();
  const multipart = new Map<string, File>();
  for (const field of uploads) {
    signal.throwIfAborted();
    const uri = field.value as string;
    const file = files.get(uri)!;
    if (isWecomDirective(field.schema['x-wecom-octet-stream'])) {
      multipart.set(fieldName(field.path), file);
      continue;
    }
    let mediaId = mediaIds.get(uri);
    if (!mediaId) {
      const result = readWecomResult(
        await api.call({
          endpoint: { path: '/cli/file/upload' },
          payload: {},
          signal,
          effect: 'write',
          form: () => {
            const form = new FormData();
            form.append('media', file, file.name);
            form.append('type', 'file');
            return form;
          },
        }),
      );
      if (
        !result ||
        typeof result !== 'object' ||
        !('media_id' in result) ||
        typeof result.media_id !== 'string'
      )
        throw new PluginError('request', 'Wecom upload returned no media ID.');
      mediaId = result.media_id;
      mediaIds.set(uri, mediaId);
    }
    const directive = field.schema['x-wecom-file-upload'];
    const withPath =
      typeof directive === 'object' &&
      directive !== null &&
      'withFilePath' in directive &&
      directive.withFilePath === true;
    payload = replace(
      payload,
      field.path,
      withPath ? { media_id: mediaId, file_path: file.uri } : mediaId,
    ) as Record<string, unknown>;
  }
  const form = hasWecomDirective(schema, ['x-wecom-octet-stream'])
    ? () => {
        const form = new FormData();
        function append(value: unknown, path: FieldPath) {
          const name = fieldName(path);
          const file = multipart.get(name);
          if (file) form.append(name, file, file.name);
          else if (Array.isArray(value))
            value.forEach((item, index) => append(item, [...path, index]));
          else if (value && typeof value === 'object')
            Object.entries(value).forEach(([key, item]) => append(item, [...path, key]));
          else if (value !== null && value !== undefined) form.append(name, String(value));
        }
        append(payload, []);
        return form;
      }
    : undefined;
  return { payload, form };
}

export function saveWecomFile(bytes: Uint8Array | string, name = 'download', encoding?: 'base64') {
  const safeName =
    name
      .split(/[\\/]/)
      .pop()
      ?.replace(/[\x00-\x1f\x7f]/g, '')
      .slice(0, 160) || 'download';
  const directory = outputDirectory();
  directory.create({ intermediates: true, idempotent: true });
  const file = new File(directory, `${randomUUID()}-${safeName}`);
  try {
    file.write(bytes, encoding ? { encoding } : undefined);
    return { file_path: file.uri, name: safeName, size: file.size };
  } catch {
    if (file.exists) file.delete();
    throw new PluginError('request', 'Could not save the Wecom file on this device.');
  }
}

export function saveWecomResult(
  schema: WecomJsonSchema | undefined,
  value: unknown,
  signal: AbortSignal,
): unknown {
  let result = value;
  if (schema)
    for (const field of fields(schema, value)) {
      const options = field.schema['x-wecom-file-save'];
      if (!options || typeof options !== 'object' || Array.isArray(options)) continue;
      const defaults = options as Record<string, unknown>;
      const data =
        typeof field.value === 'string'
          ? { content: field.value }
          : (field.value as Record<string, unknown> | null);
      if (!data || typeof data.content !== 'string') continue;
      signal.throwIfAborted();
      const name = data.file_name ?? defaults.fileName;
      const encoding = data.content_encoding ?? defaults.contentEncoding;
      const file = saveWecomFile(
        data.content,
        typeof name === 'string' ? name : 'download',
        encoding === 'base64' ? 'base64' : undefined,
      );
      result = replace(result, field.path, file.file_path);
    }
  // Keep a large result intact as a local file rather than silently truncating it in the transcript.
  const text = JSON.stringify(result);
  if (new TextEncoder().encode(text).byteLength > 120 * 1024)
    return {
      ...saveWecomFile(text, 'result.json'),
      note: 'The complete result was saved on this device. Use a smaller page or fewer fields to read it in chat.',
    };
  return result;
}
