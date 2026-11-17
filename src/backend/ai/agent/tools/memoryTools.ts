import {
  AGENT_MEMORY_DOCUMENT_BYTES,
  AgentMemoryDocumentKeySchema,
  AgentMemoryError,
  MemoryError,
  assertMemoryTarget,
  memoryContext,
  type MemorySession,
} from '@cherrystudio/memory';
import * as z from 'zod';

import type { RuntimeTool, RuntimeToolResult } from '@/backend/ai/agent/runtime';
import {
  toRuntimeInputSchema,
  toolValidationError,
} from '@/backend/ai/agent/tools/runtimeToolSchema';
import type { AgentMemoryOperations, MemoryCaller } from '@/backend/services/agentMemory';

export function createMemoryTools(
  memory: AgentMemoryOperations,
  agentId: string,
  resolveCaller?: () => MemoryCaller | undefined,
): RuntimeTool[] {
  const identityRead = z.strictObject({ key: AgentMemoryDocumentKeySchema });
  const target = z
    .string()
    .max(512)
    .refine((value) => {
      try {
        assertMemoryTarget(value);
        return true;
      } catch {
        return false;
      }
    });
  const managedRead = z.strictObject({ scope: z.enum(['private', 'shared']), path: target });
  const readSchema = z.union([identityRead, managedRead]);
  const updateSchema = z.union([
    identityRead.extend({
      content: z.string().max(AGENT_MEMORY_DOCUMENT_BYTES),
      expected_version: z.string().min(1),
    }),
    managedRead.extend({ content: z.string().max(25_000), receipt: z.string().min(1) }),
  ]);
  const deleteSchema = managedRead.extend({ receipt: z.string().min(1) });
  const listSchema = z.strictObject({ scope: z.enum(['private', 'shared']) });
  const searchSchema = z.union([
    z.strictObject({ query: z.string().trim().min(1).max(512) }),
    z.strictObject({ conversationId: z.string().min(1), messageId: z.string().min(1) }),
  ]);
  // Gateways require an object at the root. Runtime parsing still enforces each exclusive mode.
  const readInput = identityRead.partial().extend(managedRead.partial().shape);
  const updateInput = readInput.extend({
    content: z.string(),
    expected_version: z.string().optional(),
    receipt: z.string().optional(),
  });
  const searchInput = z.strictObject({
    query: z.string().optional(),
    conversationId: z.string().optional(),
    messageId: z.string().optional(),
  });
  const sessions = new Map<'private' | 'shared', MemorySession>();
  const receipts = new Map<string, { scope: string; path: string }>();
  let searchCalls = 0;
  const session = (kind: 'private' | 'shared') => {
    const caller = resolveCaller?.();
    if (!caller)
      throw new MemoryError('invalid-receipt', 'This request has no persistent memory owner');
    let value = sessions.get(kind);
    try {
      value?.assertAuthorized();
    } catch {
      value?.dispose();
      value = undefined;
    }
    if (!value) {
      value = memory.openManaged(caller, kind);
      sessions.set(kind, value);
    }
    return value;
  };
  const receipt = (input: { scope: 'private' | 'shared'; path: string; receipt: string }) => {
    const read = receipts.get(input.receipt);
    if (!read || read.scope !== input.scope || read.path !== input.path)
      throw new MemoryError(
        'invalid-receipt',
        'Read the complete target in this turn before changing it',
      );
    return input.receipt;
  };
  function tool<T>(
    name: string,
    description: string,
    schema: z.ZodType<T>,
    effect: 'read' | 'write',
    execute: (input: T, signal: AbortSignal) => Promise<RuntimeToolResult>,
    modelSchema: z.ZodType = schema,
  ): RuntimeTool {
    return {
      ref: { source: 'builtin', capabilityId: name },
      providerName: name,
      displayName: name,
      description,
      inputSchema: toRuntimeInputSchema(modelSchema),
      effect,
      approval: effect === 'read' || name === 'memory_bootstrap' ? 'auto' : 'ask',
      async execute(call) {
        const parsed = schema.safeParse(call.input);
        if (!parsed.success) return failure('invalid-input', toolValidationError(parsed.error));
        call.signal.throwIfAborted();
        try {
          const caller = resolveCaller?.();
          if (resolveCaller && (!caller || (caller.turnId && caller.turnId !== call.turnId)))
            throw new MemoryError(
              'invalid-receipt',
              'The tool call no longer owns this conversation turn',
            );
          if (caller) await memory.assertSafe(caller, call.signal);
          const result = await execute(parsed.data, call.signal);
          call.signal.throwIfAborted();
          return result;
        } catch (error) {
          call.signal.throwIfAborted();
          if (error instanceof AgentMemoryError || error instanceof MemoryError)
            return failure(error.code, error.message);
          return failure(
            'unavailable',
            'The memory operation could not be confirmed. Read the current target before retrying.',
          );
        }
      },
    };
  }
  const tools = [
    tool(
      'memory_bootstrap',
      'Complete optional identity setup or persist the user’s request to skip without changing SOUL/USER. Reset only when explicitly requested; a failed identity save is not completed setup.',
      z.strictObject({ action: z.enum(['complete', 'reset']) }),
      'write',
      async ({ action }, signal) => {
        const bootstrapCompleted = await memory.setBootstrapCompleted(
          agentId,
          action === 'complete',
          signal,
        );
        const fallback = { bootstrapCompleted, contextRefreshed: false };
        try {
          const instructions = memoryContext(await memory.snapshot(agentId, signal));
          return {
            value: { bootstrapCompleted },
            artifacts: [],
            instructions,
            instructionsFailureValue: fallback,
          };
        } catch {
          return { value: fallback, artifacts: [] };
        }
      },
    ),
    tool(
      'memory_read',
      'Read SOUL/USER using key, or a complete managed memory file using scope and path. Managed reads return a caller-bound receipt; entry snapshots and snippets do not authorize editing.',
      readSchema,
      'read',
      async (input, signal) => {
        if ('key' in input)
          return { value: await memory.read(agentId, input.key, signal), artifacts: [] };
        const value = await session(input.scope).read(input.path);
        if (value.receipt) receipts.set(value.receipt, { scope: input.scope, path: input.path });
        return { value, artifacts: [] };
      },
      readInput,
    ),
    tool(
      'memory_update',
      'Replace SOUL/USER with its expected_version, or save a complete MEMORY.md/topic proposal using the receipt from this turn’s full read. Preserve unrelated content, conditions and dates. Personal shared information excludes project/customer knowledge. New files require a read confirming absence.',
      updateSchema,
      'write',
      async (input, signal) => {
        if ('key' in input) {
          const file = await memory.write(
            {
              agentId,
              key: input.key,
              content: input.content,
              expectedVersion: input.expected_version,
            },
            signal,
          );
          const fallback = { status: 'saved', file, contextRefreshed: false };
          try {
            return {
              value: file,
              artifacts: [],
              instructions: memoryContext(await memory.snapshot(agentId, signal), true),
              instructionsFailureValue: fallback,
            };
          } catch {
            return { value: fallback, artifacts: [] };
          }
        }
        const result = await session(input.scope).commit(
          [{ kind: 'write', receipt: receipt(input), content: input.content }],
          async () => () => {
            signal.throwIfAborted();
            return undefined;
          },
        );
        return committed(result);
      },
      updateInput,
    ),
  ];
  if (resolveCaller)
    tools.push(
      tool(
        'memory_list',
        'List managed memory entry and topic filenames in the authorized scope. Private means this Agent only. Backup, identity and legacy files are excluded.',
        listSchema,
        'read',
        async ({ scope }) => ({ value: { paths: await session(scope).list() }, artifacts: [] }),
      ),
      tool(
        'memory_delete',
        'Delete the exact managed topic/file read in this turn, with approval, backup and version checks. Never delete a topic until its full content and all links have been preserved in a different topic.',
        deleteSchema,
        'write',
        async (input, signal) =>
          committed(
            await session(input.scope).commit(
              [{ kind: 'delete', receipt: receipt(input) }],
              async () => () => {
                signal.throwIfAborted();
                return undefined;
              },
            ),
          ),
      ),
      tool(
        'memory_search',
        'Recall this Agent’s own successful historical chats when current context and memory entries are insufficient. Use focused keywords, or conversationId and messageId to expand a hit. At most four calls per answer. The current question is excluded. User text is factual evidence; assistant text is context. A miss does not prove absence.',
        searchSchema,
        'read',
        async (input, signal) => {
          if (++searchCalls > 4)
            return failure(
              'limit',
              'The four-call history recall budget is exhausted for this answer.',
            );
          return { value: await memory.recall(resolveCaller()!, input, signal), artifacts: [] };
        },
        searchInput,
      ),
    );
  return tools;
}
function committed(value: {
  error?: string;
  files: readonly { outcome: string }[];
}): RuntimeToolResult {
  if (
    value.error ||
    value.files.some((file) => file.outcome === 'pending' || file.outcome === 'conflict')
  )
    return {
      ...failure('conflict', value.error ?? 'The complete memory save could not be confirmed.'),
      value: JSON.parse(JSON.stringify(value)),
    };
  return { value: JSON.parse(JSON.stringify(value)), artifacts: [] };
}
function failure(code: string, message: string): RuntimeToolResult {
  return {
    value: { status: 'error', code, message },
    artifacts: [],
    failure: {
      scope: 'call',
      error: { code: 'memory_' + code, message, retryable: false, origin: 'tool' },
    },
  };
}
