import { z } from 'zod';

import type { DiagnosticToolId } from '@/shared/contracts/diagnosticSession';

import definition from './diagnosticAgent.json';

/** The bundled resource is the single editable definition of this internal Agent. */
export const diagnosticAgentDefinition = definition satisfies {
  tools: Record<DiagnosticToolId, string>;
};

export const DiagnosticAnswerSchema = z.strictObject({
  cause: z.string().trim().min(1).max(definition.answer.causeCharacters),
  advice: z
    .array(z.string().trim().min(1).max(definition.answer.adviceCharacters))
    .min(1)
    .max(definition.answer.adviceItems)
    .transform((values) => [...new Set(values)]),
});

export function buildDiagnosticInstructions(language: string): string {
  return definition.instructions
    .join('\n')
    .replaceAll('{{toolCalls}}', () => String(definition.limits.toolCalls))
    .replaceAll('{{language}}', () => language);
}
