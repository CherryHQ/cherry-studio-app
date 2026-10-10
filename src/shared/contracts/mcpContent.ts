import * as z from 'zod';

/** Host-issued resource authority, independent of server-authored result JSON. */
export const McpResultSourceSchema = z.strictObject({
  serverId: z.string().min(1),
  connectionKey: z.string().regex(/^remote:[a-f0-9]{64}$/),
});
export type McpResultSource = z.infer<typeof McpResultSourceSchema>;
export type McpResourceReference = { source: McpResultSource; uri: string };

/** Explicit model channel; UI metadata never travels through this projection. */
export const McpModelContentSchema = z.array(
  z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('text'), text: z.string() }),
    z.strictObject({
      type: z.literal('image'),
      fileEntryId: z.uuid(),
      mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
    }),
  ]),
);
export type McpModelContent = z.infer<typeof McpModelContentSchema>;
/** Transient bytes; canonical transcripts keep the managed file reference instead. */
export type McpModelOutputContent = (
  | { type: 'text'; text: string }
  | {
      type: 'image';
      data: string;
      mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
    }
)[];
const McpInlineImageSchema = z.object({
  type: z.literal('image'),
  data: z.string(),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
});

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_CHARS = 64 * 1024;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Also used for pre-projection history, so older tool envelopes cannot leak _meta. */
export function projectMcpModelContent(value: unknown): McpModelOutputContent {
  const result = record(value);
  const content: McpModelOutputContent = [];
  let imageBytes = 0;
  const blocks = Array.isArray(result?.content) ? result.content.slice(0, 64) : [];
  for (const item of blocks) {
    const block = record(item);
    if (!block) continue;
    const audience = record(block.annotations)?.audience;
    if (Array.isArray(audience) && !audience.includes('assistant')) continue;
    if (block.type === 'image' && typeof block.data === 'string') {
      const parsed = McpInlineImageSchema.safeParse({
        type: 'image',
        data: block.data,
        mimeType: block.mimeType,
      });
      const bytes = block.data.length * 0.75;
      if (
        parsed.success &&
        bytes + imageBytes <= MAX_IMAGE_BYTES &&
        /^[a-zA-Z0-9+/]*={0,2}$/.test(block.data)
      ) {
        imageBytes += bytes;
        content.push(parsed.data);
      } else {
        content.push({
          type: 'text',
          text: '[MCP image omitted: unsupported format or size limit]',
        });
      }
    } else if (block.type === 'text' && typeof block.text === 'string') {
      content.push({ type: 'text', text: block.text });
    } else if (block.type === 'resource') {
      const resource = record(block.resource);
      content.push({
        type: 'text',
        text:
          JSON.stringify(
            stripMcpMetadata(
              resource
                ? {
                    uri: resource.uri,
                    mimeType: resource.mimeType,
                    ...(typeof resource.text === 'string'
                      ? { text: resource.text }
                      : { note: 'Binary resource available as an attachment' }),
                  }
                : null,
            ),
          ) ?? 'null',
      });
    } else if (block.type === 'resource_link') {
      content.push({ type: 'text', text: JSON.stringify(stripMcpMetadata(block)) });
    } else if (block.type === 'audio') {
      content.push({
        type: 'text',
        text: '[MCP audio returned; this model channel supports text and images]',
      });
    }
  }
  if (result?.structuredContent !== undefined) {
    content.push({
      type: 'text',
      text: JSON.stringify(stripMcpMetadata(result.structuredContent)),
    });
  }
  if (result?.isError === true)
    content.unshift({ type: 'text', text: '[MCP tool reported an error]' });
  if (!content.length)
    content.push({
      type: 'text',
      text: Array.isArray(result?.content)
        ? '[MCP result has no model-visible content]'
        : (JSON.stringify(stripMcpMetadata(value)) ?? 'null'),
    });
  let remaining = MAX_TEXT_CHARS;
  return content.flatMap((block): McpModelOutputContent => {
    if (block.type === 'image') return [block];
    if (remaining <= 0) return [];
    const text = block.text.slice(0, remaining);
    remaining -= text.length;
    return [
      {
        type: 'text' as const,
        text: text.length < block.text.length ? `${text}\n[MCP text truncated]` : text,
      },
    ];
  });
}

export function stripMcpMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripMcpMetadata);
  const object = record(value);
  if (!object) return value;
  return Object.fromEntries(
    Object.entries(object)
      .filter(([key]) => key !== '_meta')
      .map(([key, item]) => [key, stripMcpMetadata(item)]),
  );
}
