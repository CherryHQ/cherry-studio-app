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

import type {
  AiUsagePricingSnapshot,
  ServingCredentialReceipt,
} from '@/shared/data/types/aiUsageRecord';
import type { Currency } from '@/shared/data/types/model';

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

/** User-visible model-loop activity that is not an executable application capability. */
export type RuntimeMetaToolRef = { source: 'meta'; name: string };

export type RuntimeMessageToolRef = RuntimeToolRef | RuntimeMetaToolRef;

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

export type RuntimeTextAttachmentPart = {
  fileEntryId: string;
  type: 'text-attachment';
  mediaType: string;
  name: string;
  text: string;
  truncated: boolean;
  trust: 'untrusted-user-content';
};

export type RuntimeInputPart =
  | { type: 'text'; text: string }
  | RuntimeTextAttachmentPart
  | { type: 'file'; mediaType: string; name?: string; uri: string };

export type RuntimeMessagePart =
  | { type: 'text' | 'reasoning'; text: string }
  | RuntimeTextAttachmentPart
  | { type: 'file'; mediaType: string; name?: string; uri: string }
  | {
      type: 'tool-call';
      toolCallId: string;
      toolRef: RuntimeMessageToolRef;
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
  /** Persisted provider usage, when available, for Runtime-owned context estimation. */
  usage?: RuntimeUsage;
};

/** One persisted application turn, kept intact for Runtime-owned context policy. */
export type RuntimeHistoryTurn = {
  turnId: string | null;
  messages: RuntimeMessage[];
};

/** Versioned, opaque Runtime context artifact persisted and replayed by the Host. */
export type RuntimeContextCheckpoint = {
  version: 1;
  anchorTurnId: string;
  payload: RuntimeJsonValue;
};

/**
 * One tool invocation. A single object on purpose: a positional context
 * parameter can be silently dropped by an implementation, while an ignored
 * `signal` field stays visible at the destructuring site.
 */
export type RuntimeToolCall = {
  input: RuntimeJsonValue;
  signal: AbortSignal;
  toolCallId: string;
};

export type RuntimeTool = {
  ref: RuntimeToolRef;
  providerName: string;
  displayName: string;
  description: string;
  inputSchema: RuntimeJsonValue;
  approval: 'auto' | 'ask' | 'deny';
  /**
   * False keeps the Agent's global auto mode from promoting this tool's `ask`
   * (cost-bearing or permission-gated calls). Absent means eligible.
   */
  autoApprovalEligible?: boolean;
  execute(call: RuntimeToolCall): Promise<RuntimeToolResult>;
};

export type RuntimeExecutionRequest = {
  turnId: string;
  instructions: string;
  model: RuntimeModel;
  history: RuntimeHistoryTurn[];
  contextCheckpoint: RuntimeContextCheckpoint | null;
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
      toolRef: RuntimeMessageToolRef;
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

/**
 * Provider-resolution snapshot captured before execution starts. JSON-safe and
 * structurally aligned with the mobile usage-record capture context; the Host
 * completes it with source and message attribution before recording.
 */
export type RuntimeUsageContext = {
  providerId: string;
  providerName: string | null;
  modelId: string;
  modelName: string | null;
  pricingSnapshot: AiUsagePricingSnapshot | null;
  trustProviderReportedCost: boolean;
  reportedCostCurrency: Currency | null;
  credentialReceipt: ServingCredentialReceipt;
};

export type RuntimeUsageReport = {
  usage: RuntimeUsage;
  context: RuntimeUsageContext;
  completedAt: number;
};

export type RuntimeErrorContext = {
  statusCode?: number;
  providerId?: string;
  modelId?: string;
  finishReason?: string;
  responseBody?: string;
};

export type RuntimeError = {
  code: string;
  message: string;
  retryable: boolean;
  origin?: 'provider' | 'runtime' | 'host' | 'tool';
  name?: string;
  context?: RuntimeErrorContext;
};

export type RuntimeEvent =
  | { type: 'part.add'; index: number; part: RuntimeOutputPart }
  | { type: 'text.delta'; partId: string; text: string }
  | { type: 'part.replace'; part: RuntimeOutputPart }
  | { type: 'approval.requested'; approval: RuntimeApproval }
  | { type: 'approval.resolved'; approval: RuntimeApproval }
  | { type: 'context.checkpoint'; checkpoint: RuntimeContextCheckpoint }
  | ({ type: 'usage' } & RuntimeUsageReport)
  | { type: 'completed' }
  | { type: 'failed'; error: RuntimeError }
  | { type: 'cancelled' };
