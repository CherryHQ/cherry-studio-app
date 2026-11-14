import { z } from 'zod';

import {
  DiagnosticToolResultSchema,
  type DiagnosticFactReader,
  type DiagnosticEvidence,
  type DiagnosticToolResult,
} from '@/shared/contracts/diagnosticSession';

import { raceAbort, RuntimeJsonValueSchema, type RuntimeTool } from '../runtime';
import { diagnosticAgentDefinition } from './diagnosticAgentDefinition';

const EmptyInputSchema = z.strictObject({});

/** Attach the Agent's fixed tools to this run's already scoped, credential-free fact readers. */
export function createDiagnosticTools(
  facts: DiagnosticFactReader,
  signal: AbortSignal,
  onEvidence: (evidence: DiagnosticEvidence) => void,
): RuntimeTool[] {
  return DiagnosticToolResultSchema.options.map<RuntimeTool>((schema) => {
    const id = schema.shape.tool.value;
    return {
      ref: { source: 'builtin', capabilityId: `diagnostic_${id}` },
      providerName: `diagnostic_${id}`,
      displayName: `diagnostic.${id}`,
      description: diagnosticAgentDefinition.tools[id],
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      approval: 'auto',
      effect: 'read',
      async execute({ input, signal: toolSignal, toolCallId }) {
        EmptyInputSchema.parse(input);
        signal.throwIfAborted();
        const result = DiagnosticToolResultSchema.parse({
          tool: id,
          data: await raceAbort<DiagnosticToolResult['data']>(facts[id](toolSignal), signal),
        });
        const serialized = JSON.stringify(result.data);
        const bounded =
          new TextEncoder().encode(serialized).byteLength <=
          diagnosticAgentDefinition.limits.toolResultBytes;
        const value = bounded
          ? RuntimeJsonValueSchema.parse(JSON.parse(serialized))
          : { status: 'unavailable', reason: 'result_limit' };
        onEvidence(
          bounded
            ? { id: toolCallId, ...result }
            : { id: toolCallId, tool: id, unavailable: 'result_limit' },
        );
        return { value, artifacts: [] };
      },
    };
  });
}
