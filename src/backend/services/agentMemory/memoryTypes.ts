import * as z from 'zod';

export const AgentMemoryDocumentKeySchema = z.enum(['soul', 'user', 'fact']);
export type AgentMemoryDocumentKey = z.infer<typeof AgentMemoryDocumentKeySchema>;
export type AgentMemoryKey = AgentMemoryDocumentKey | 'journal';

export const AGENT_MEMORY_DOCUMENT_BYTES = 1024 * 1024;
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
