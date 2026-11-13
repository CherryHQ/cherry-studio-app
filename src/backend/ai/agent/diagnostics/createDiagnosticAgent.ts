import { v4 as uuid } from 'uuid';

import {
  DiagnosticSessionError,
  DiagnosticAiContextSchema,
  type DiagnosticAiReport,
  type DiagnosticAgent,
  type DiagnosticAgentRequest,
  type DiagnosticEvidence,
} from '@/shared/contracts/diagnosticSession';

import {
  raceAbort,
  RUNTIME_EXECUTION_LIMIT_CODE,
  type AgentRuntime,
  type RuntimeOutputPart,
  type RuntimeUsageReport,
} from '../runtime';
import {
  buildDiagnosticInstructions,
  DiagnosticAnswerSchema,
  diagnosticAgentDefinition,
} from './diagnosticAgentDefinition';
import { createDiagnosticTools } from './diagnosticAgentTools';

type Dependencies = {
  runtime: Pick<AgentRuntime, 'preflightModel' | 'open'>;
  onUsage(report: RuntimeUsageReport): Promise<void>;
};

/** Reusable internal Agent; every run owns a fresh memory-only session and evidence collection. */
export function createDiagnosticAgent(dependencies: Dependencies): DiagnosticAgent {
  return {
    timeoutMs: diagnosticAgentDefinition.limits.timeoutMs,
    run: (input) => runDiagnosticAgent(dependencies, input),
  };
}

async function runDiagnosticAgent(
  { runtime, onUsage }: Dependencies,
  input: DiagnosticAgentRequest,
): Promise<DiagnosticAiReport> {
  const context = DiagnosticAiContextSchema.parse(input.context);
  const preflight = await raceAbort(runtime.preflightModel(input.model), input.signal);
  if (!preflight.supportsTools) throw new DiagnosticSessionError('unsupported_model');
  const session = await raceAbort(runtime.open(), input.signal);
  const turnId = uuid();
  const evidence: DiagnosticEvidence[] = [];
  const usage: Promise<void>[] = [];
  const tools = createDiagnosticTools(input.facts, input.signal, (entry) => {
    evidence.push(entry);
    input.onEvidence?.(entry);
  });
  const cancel = () => {
    void session.cancel(turnId).catch(() => undefined);
  };
  input.signal.addEventListener('abort', cancel, { once: true });
  const parts: RuntimeOutputPart[] = [];
  const execute = async () => {
    input.signal.throwIfAborted();
    const events = session.execute({
      sessionId: uuid(),
      turnId,
      model: input.model,
      history: [],
      contextCheckpoint: null,
      limits: {
        toolCalls: diagnosticAgentDefinition.limits.toolCalls,
        modelCalls: diagnosticAgentDefinition.limits.modelCalls,
      },
      instructions: buildDiagnosticInstructions(input.language),
      input: [{ type: 'text', text: JSON.stringify(context) }],
      options: {
        reasoningEffort: diagnosticAgentDefinition.reasoningEffort,
        maxOutputTokens: Math.min(
          preflight.maxOutputTokens,
          diagnosticAgentDefinition.limits.outputTokens,
        ),
      },
      tools,
    });
    for await (const event of events) {
      if (event.type === 'usage') usage.push(onUsage(event));
      if (event.type === 'part.add') parts.splice(event.index, 0, event.part);
      if (event.type === 'part.replace') {
        const index = parts.findIndex((part) => part.id === event.part.id);
        if (index >= 0) parts[index] = event.part;
      }
      if (event.type === 'text.delta') {
        const index = parts.findIndex((part) => part.id === event.partId);
        const part = parts[index];
        if (part?.type === 'text') parts[index] = { ...part, text: part.text + event.text };
      }
      if (
        parts.reduce((length, part) => length + (part.type === 'text' ? part.text.length : 0), 0) >
        diagnosticAgentDefinition.limits.answerCharacters
      )
        throw new DiagnosticSessionError('invalid_response');
      if (event.type === 'failed')
        throw new DiagnosticSessionError(
          event.error.code === RUNTIME_EXECUTION_LIMIT_CODE ? 'budget' : 'unavailable',
        );
      if (event.type === 'cancelled') throw new DiagnosticSessionError('cancelled');
      if (event.type === 'completed') {
        // Earlier assistant text can describe a pending tool call; only the final answer is JSON.
        const text = parts
          .slice(parts.findLastIndex((part) => part.type === 'tool') + 1)
          .flatMap((part) => (part.type === 'text' ? [part.text] : []))
          .join('')
          .trim()
          .replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, '$1');
        try {
          const result = DiagnosticAnswerSchema.parse(JSON.parse(text));
          return { ...result, modelName: input.model.name, evidence };
        } catch {
          throw new DiagnosticSessionError('invalid_response');
        }
      }
    }
    throw new DiagnosticSessionError('unavailable');
  };
  try {
    return await raceAbort(execute(), input.signal);
  } finally {
    input.signal.removeEventListener('abort', cancel);
    await session.close();
    await Promise.allSettled(usage);
  }
}
