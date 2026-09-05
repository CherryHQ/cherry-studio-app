import type { ModelMessage, PrepareStepFunction, StepResult, ToolSet } from 'ai';

export interface ErrorContext {
  error: Error;
}

export interface ToolExecutionStartEvent {
  callId: string;
  input: unknown;
  messages: ModelMessage[];
  toolName: string;
}

export type ToolExecutionEndEvent = ToolExecutionStartEvent & {
  durationMs: number;
  toolOutput: { type: 'tool-result'; output: unknown } | { type: 'tool-error'; error: unknown };
};

export interface AgentLoopHooks {
  onAbort?: () => Promise<void> | void;
  onError?: (context: ErrorContext) => Promise<'abort' | 'retry'> | 'abort' | 'retry';
  onFinish?: () => Promise<void> | void;
  onStart?: () => Promise<void> | void;
  onStepFinish?: (step: StepResult<ToolSet>) => Promise<void> | void;
  onToolExecutionEnd?: (event: ToolExecutionEndEvent) => Promise<void> | void;
  onToolExecutionStart?: (event: ToolExecutionStartEvent) => Promise<void> | void;
  prepareStep?: PrepareStepFunction;
}

export type ToolExecutionHooks = Pick<
  AgentLoopHooks,
  'onToolExecutionEnd' | 'onToolExecutionStart'
>;
