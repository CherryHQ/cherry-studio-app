import { asSchema } from 'ai';

import type { ToolEntry } from '../types';
import { schemaToJSDoc } from './formatJsDoc';

export async function serializeToolSchema(schema: unknown): Promise<unknown> {
  if (!schema) return undefined;
  try {
    return await asSchema(schema as Parameters<typeof asSchema>[0]).jsonSchema;
  } catch {
    return undefined;
  }
}

export async function buildToolStub<TScope>(entry: ToolEntry<TScope>): Promise<string> {
  return schemaToJSDoc(
    entry.name,
    entry.description,
    await serializeToolSchema(entry.tool.inputSchema),
  );
}
