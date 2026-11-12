import * as z from 'zod';

export const AgentMemoryKeySchema = z.enum(['soul', 'user', 'fact', 'journal']);
export const AgentMemoryDocumentKeySchema = z.enum(['soul', 'user', 'fact']);
export type AgentMemoryKey = z.infer<typeof AgentMemoryKeySchema>;
export type AgentMemoryDocumentKey = z.infer<typeof AgentMemoryDocumentKeySchema>;

export const AGENT_MEMORY_DOCUMENT_BYTES = 32 * 1024;
export const AGENT_MEMORY_JOURNAL_BYTES = 1024 * 1024;

export type AgentMemoryFile = {
  key: AgentMemoryKey;
  content: string;
  version: string;
  truncated: boolean;
};

export type AgentMemorySnapshot = Record<AgentMemoryDocumentKey, AgentMemoryFile>;

export type AgentMemoryJournalEntry = { ts: string; tags: string[]; text: string };

export type AgentMemoryErrorCode = 'conflict' | 'too-large' | 'agent-unavailable' | 'unavailable';

export class AgentMemoryError extends Error {
  constructor(readonly code: AgentMemoryErrorCode) {
    super(`Agent memory: ${code}`);
    this.name = 'AgentMemoryError';
  }
}

/** File keys and versions cross this boundary; physical paths never do. */
export interface AgentMemoryModule {
  read(agentId: string, key: AgentMemoryKey, signal?: AbortSignal): Promise<AgentMemoryFile>;
  write(
    input: {
      agentId: string;
      key: AgentMemoryDocumentKey;
      content: string;
      expectedVersion: string;
    },
    signal?: AbortSignal,
  ): Promise<AgentMemoryFile>;
}
