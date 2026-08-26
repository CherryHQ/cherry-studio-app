/**
 * Agent Runtime contract types.
 *
 * These are the process-local execution primitives described in
 * `docs/references/agent/agent-runtime.md`. The contract is deliberately
 * independent of the Agent Protocol, persistence, React, and Expo: a Runtime
 * knows prepared prompts, models, history, tools, input, and normalized
 * execution events, and nothing about Cherry Agent or Session entities, SQLite,
 * the Data API, navigation, or UI state.
 *
 * Tool callbacks and `AbortSignal` are permitted here precisely because this
 * contract never crosses the JSON-safe application protocol boundary.
 *
 * Shapes mirror the design document exactly. Do not add, rename, or "improve"
 * fields without updating the spec first.
 */

import type { AiUsageCaptureContext } from '@cherrystudio/ai-runtime/utils';

/** A JSON-safe value. Tool schemas, tool input/output, and history payloads use it. */
export type RuntimeJsonValue =
  | null
  | boolean
  | number
  | string
  | RuntimeJsonValue[]
  | { [key: string]: RuntimeJsonValue };

export type RuntimeCapabilities = {
  reasoning: boolean;
  tools: boolean;
  approvals: boolean;
  attachments: boolean;
};

export type RuntimeDescriptor = {
  id: string;
  name: string;
  capabilities: RuntimeCapabilities;
};

export interface AgentRuntime {
  readonly descriptor: RuntimeDescriptor;
  preflightModel(model: RuntimeModel): Promise<RuntimeModelPreflight>;
  open(): Promise<AgentRuntimeSession>;
}

export interface AgentRuntimeSession {
  execute(request: RuntimeExecutionRequest): AsyncIterable<RuntimeEvent>;
  cancel(turnId: string): Promise<void>;
  respondApproval(input: {
    turnId: string;
    approvalId: string;
    decision: 'approve' | 'deny';
  }): Promise<void>;
  close(): Promise<void>;
}

export type RuntimeModel = {
  providerId: string;
  modelId: string;
};

export type RuntimeInputModality = 'text' | 'image';

/**
 * JSON-safe model facts the Host may inspect before reserving a turn. Runtime
 * implementations keep provider SDK model objects behind their own boundary.
 */
export type RuntimeModelPreflight = {
  contextWindow: number;
  inputModalities: RuntimeInputModality[];
  maxInputTokens: number;
  maxOutputTokens: number;
  supportsTools: boolean;
};

export type RuntimeOptions = {
  reasoningEffort?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  maxOutputTokens?: number;
  temperature?: number;
};

export type RuntimeToolRef =
  | { source: 'builtin'; capabilityId: string }
  | { source: 'mcp'; serverId: string; rawToolName: string };

export type RuntimeArtifact = {
  ref: { kind: 'managed-file'; fileEntryId: string };
  mediaType: string;
  name: string;
  kind: 'created' | 'derived';
};

export type RuntimeToolResult = {
  value: RuntimeJsonValue;
  artifacts: RuntimeArtifact[];
};

export type RuntimeInputPart =
  | { type: 'text'; text: string }
  | { type: 'file'; mediaType: string; name?: string; uri: string };

export type RuntimeMessagePart =
  | { type: 'text' | 'reasoning'; text: string }
  | { type: 'file'; mediaType: string; name?: string; uri: string }
  | {
      type: 'tool-call';
      toolCallId: string;
      toolRef: RuntimeToolRef;
      providerName: string;
      input: RuntimeJsonValue;
    }
  | {
      type: 'tool-result';
      toolCallId: string;
      output: RuntimeToolResult;
      isError: boolean;
    };

export type RuntimeMessage = {
  role: 'user' | 'assistant' | 'system';
  parts: RuntimeMessagePart[];
};

export type RuntimeTool = {
  ref: RuntimeToolRef;
  providerName: string;
  displayName: string;
  description: string;
  inputSchema: RuntimeJsonValue;
  approval: 'auto' | 'ask' | 'deny';
  execute(
    input: RuntimeJsonValue,
    context: { signal: AbortSignal; toolCallId: string },
  ): Promise<RuntimeToolResult>;
};

export type RuntimeExecutionRequest = {
  turnId: string;
  instructions: string;
  model: RuntimeModel;
  history: RuntimeMessage[];
  input: RuntimeInputPart[];
  tools: RuntimeTool[];
  options: RuntimeOptions;
};

export type RuntimeOutputPart =
  | {
      id: string;
      type: 'text' | 'reasoning';
      text: string;
      state: 'streaming' | 'done';
    }
  | {
      id: string;
      type: 'file';
      ref: { kind: 'managed-file'; fileEntryId: string };
      mediaType: string;
      name: string;
      purpose: 'artifact';
    }
  | {
      id: string;
      type: 'tool';
      toolCallId: string;
      toolRef: RuntimeToolRef;
      providerName: string;
      displayName: string;
      state:
        | 'input-available'
        | 'awaiting-approval'
        | 'running'
        | 'output-available'
        | 'denied'
        | 'error'
        | 'interrupted';
      input?: RuntimeJsonValue;
      output?: RuntimeToolResult;
      approvalId?: string;
      error?: RuntimeError;
    };

export type RuntimeApproval = {
  id: string;
  turnId: string;
  toolCallId: string;
  toolRef: RuntimeToolRef;
  displayName: string;
  input: RuntimeJsonValue;
  status: 'pending' | 'approved' | 'denied';
};

export type RuntimeUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  noCacheTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

/** Provider-resolution snapshot captured before execution starts. */
export type RuntimeUsageContext = Omit<AiUsageCaptureContext, 'source' | 'messageRef'>;

export type RuntimeUsageReport = {
  usage: RuntimeUsage;
  context: RuntimeUsageContext;
  completedAt: number;
};

export type RuntimeError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type RuntimeEvent =
  | { type: 'part.add'; index: number; part: RuntimeOutputPart }
  | { type: 'text.delta'; partId: string; text: string }
  | { type: 'part.replace'; part: RuntimeOutputPart }
  | { type: 'approval.requested'; approval: RuntimeApproval }
  | { type: 'approval.resolved'; approval: RuntimeApproval }
  | ({ type: 'usage' } & RuntimeUsageReport)
  | { type: 'completed' }
  | { type: 'failed'; error: RuntimeError }
  | { type: 'cancelled' };
