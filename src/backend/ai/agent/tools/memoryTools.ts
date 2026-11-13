import * as z from 'zod';

import type { RuntimeTool, RuntimeToolResult } from '@/backend/ai/agent/runtime';
import {
  toRuntimeInputSchema,
  toolValidationError,
} from '@/backend/ai/agent/tools/runtimeToolSchema';
import type { AgentMemoryOperations } from '@/backend/services/agentMemory';
import { memoryContext } from '@/backend/services/agentMemory/memoryContext';
import {
  AGENT_MEMORY_DOCUMENT_BYTES,
  AgentMemoryDocumentKeySchema,
  AgentMemoryError,
} from '@/backend/services/agentMemory/memoryTypes';

export function createMemoryTools(memory: AgentMemoryOperations, agentId: string): RuntimeTool[] {
  const readSchema = z.strictObject({ key: AgentMemoryDocumentKeySchema });
  const updateSchema = readSchema.extend({
    content: z
      .string()
      .max(AGENT_MEMORY_DOCUMENT_BYTES)
      .describe(
        'Complete replacement; preserve unrelated valid memory. Empty clears the document.',
      ),
    expected_version: z
      .string()
      .min(1)
      .describe(
        'Exact version from the current memory snapshot or memory_read. Read again on conflict.',
      ),
  });
  const appendSchema = z.strictObject({
    text: z.string().trim().min(1).max(8_000),
    tags: z.array(z.string().max(64)).max(16).optional(),
  });
  const searchSchema = z.strictObject({
    query: z.string().max(512).optional(),
    tag: z.string().max(64).optional(),
    limit: z.int().min(1).max(50).optional(),
  });
  const bootstrapSchema = z.strictObject({ action: z.enum(['complete', 'reset']) });

  function tool<T>(
    name: string,
    description: string,
    schema: z.ZodType<T>,
    effect: 'read' | 'write',
    execute: (input: T, signal: AbortSignal) => Promise<RuntimeToolResult>,
  ): RuntimeTool {
    return {
      ref: { source: 'builtin', capabilityId: name },
      providerName: name,
      displayName: name,
      description,
      inputSchema: toRuntimeInputSchema(schema),
      effect,
      // Turning off optional onboarding must not require another confirmation.
      approval: effect === 'read' || name === 'memory_bootstrap' ? 'auto' : 'ask',
      async execute(call) {
        const parsed = schema.safeParse(call.input);
        if (!parsed.success) return failure('invalid-input', toolValidationError(parsed.error));
        call.signal.throwIfAborted();
        try {
          return await execute(parsed.data, call.signal);
        } catch (error) {
          call.signal.throwIfAborted();
          if (!(error instanceof AgentMemoryError))
            return failure(
              'unavailable',
              'The memory operation could not be confirmed. Read current memory or search the journal before considering another write.',
            );
          return failure(
            error.code,
            error.code === 'conflict'
              ? 'Read the current document and reconcile your change before retrying.'
              : error.message,
          );
        }
      },
    };
  }
  return [
    tool(
      'memory_bootstrap',
      'Control this Agent’s optional one-time persona and user setup. complete persists completion or the user’s request to skip, without changing identity files. reset re-enables setup for the next turn only when the user explicitly asks. Never mark a failed identity save complete.',
      bootstrapSchema,
      'write',
      async ({ action }, signal) => {
        const bootstrapCompleted = await memory.setBootstrapCompleted(
          agentId,
          action === 'complete',
          signal,
        );
        const value = { bootstrapCompleted };
        try {
          return {
            value,
            artifacts: [],
            // Completion removes old guidance now; reset starts on the next prepared turn.
            instructions: memoryContext(await memory.snapshot(agentId, signal)),
            instructionsFailureValue: { ...value, contextRefreshed: false },
          };
        } catch {
          return { value: { ...value, contextRefreshed: false }, artifacts: [] };
        }
      },
    ),
    tool(
      'memory_read',
      'Read this Agent’s SOUL (persona), USER (user context) or FACT (durable facts), including its current write version.',
      readSchema,
      'read',
      async ({ key }, signal) => ({
        value: await memory.read(agentId, key, signal),
        artifacts: [],
      }),
    ),
    tool(
      'memory_update',
      'Replace a private memory document with a version check. SOUL: persona; USER: user context; FACT: durable knowledge. Keep unrelated useful content.',
      updateSchema,
      'write',
      async ({ key, content, expected_version }, signal) => {
        const file = await memory.write(
          { agentId, key, content, expectedVersion: expected_version },
          signal,
        );
        try {
          const instructions = memoryContext(await memory.snapshot(agentId, signal), true);
          return {
            value: file,
            artifacts: [],
            instructions,
            instructionsFailureValue: { status: 'saved', file, contextRefreshed: false },
          };
        } catch {
          return { value: { status: 'saved', file, contextRefreshed: false }, artifacts: [] };
        }
      },
    ),
    tool(
      'memory_append',
      'Append a one-time event, completed task or session note to this Agent’s private journal.',
      appendSchema,
      'write',
      async ({ text, tags }, signal) => ({
        value: await memory.append(agentId, text, tags ?? [], signal),
        artifacts: [],
      }),
    ),
    tool(
      'memory_search',
      'Search this Agent’s journal by case-insensitive text and optional tag. Returns latest matches; FACT is already in context and is not searched.',
      searchSchema,
      'read',
      async (input, signal) => ({
        value: { entries: await memory.search(agentId, input, signal) },
        artifacts: [],
      }),
    ),
  ];
}

function failure(code: string, message: string): RuntimeToolResult {
  return {
    value: { status: 'error', code, message },
    artifacts: [],
    failure: {
      scope: 'call',
      error: { code: `memory_${code}`, message, retryable: false, origin: 'tool' },
    },
  };
}
