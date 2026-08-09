import type { Tool } from 'ai';

export type ToolDefer = 'never' | 'always' | 'auto';

export interface ToolEntry<TScope = unknown> {
  readonly name: string;
  readonly namespace: string;
  readonly description: string;
  readonly defer: ToolDefer;
  readonly tool: Tool;
  buildTool?(scope: TScope): Tool;
  applies?(scope: TScope): boolean;
}

export interface RequestContext<TAssistant = unknown> {
  readonly requestId: string;
  readonly chatId?: string;
  readonly assistant?: TAssistant;
  readonly abortSignal?: AbortSignal;
}

export type ToolRuntimeDiagnostic = {
  code: 'approval-check-failed' | 'tool-materialization-failed' | 'tool-repair-failed';
  error: unknown;
  toolName: string;
};

export type ToolRuntimeDiagnostics = (diagnostic: ToolRuntimeDiagnostic) => void;

export function emitToolRuntimeDiagnostic(
  diagnostics: ToolRuntimeDiagnostics | undefined,
  diagnostic: ToolRuntimeDiagnostic,
): void {
  try {
    diagnostics?.(diagnostic);
  } catch {
    // Diagnostics must never change tool execution policy.
  }
}
