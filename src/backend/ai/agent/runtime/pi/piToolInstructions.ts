import type { Context } from '@earendil-works/chord/context';
import {
  defineDoc,
  type ConversationId,
  type HookApi,
  section,
  type ToolExecutionApi,
  type Tx,
} from '@earendil-works/pi-durable';
import { z } from 'zod';

import type { RuntimeToolResult } from '../types';

const instructionsSchema = z.strictObject({
  key: z.string().min(1).max(256),
  text: z.string().min(1).max(128_000),
});

/** Current execution only; the Host rebuilds applicable instructions for the next configuration. */
export const ToolInstructions = defineDoc<{ sections: { key: string; text: string }[] }>({
  kind: 'cherry.tool-instructions',
  version: 1,
  scope: 'conversation',
  checkpointWhen: () => true,
  history: 'latest',
  fork: 'initial',
  initial: () => ({ sections: [] }),
});

/** Native sections render committed state before every request, including after compaction/reopen. */
export const toolInstructionsSection = section(
  'cherry-tool-instructions',
  async (input, context) => {
    const document = await input.read.snapshot(ToolInstructions, input.conversationId, context);
    return document?.sections.length
      ? document.sections.map(({ text }) => text).join('\n\n')
      : undefined;
  },
  { tag: false },
);

export async function retainToolInstructionsTx(
  tx: Tx,
  conversationId: ConversationId,
  instructions: NonNullable<RuntimeToolResult['instructions']>,
): Promise<void> {
  const parsed = instructionsSchema.parse(instructions);
  const document = await tx.doc(ToolInstructions, conversationId);
  const sections = document.sections.filter(({ key }) => key !== parsed.key);
  sections.push(parsed);
  // Bounded independently of the compactable tool result, including concurrent tool loads.
  if (
    sections.length > 64 ||
    sections.reduce((size, entry) => size + entry.text.length, 0) > 128_000
  )
    throw new Error('The retained tool instruction budget is full.');
  document.sections = sections;
}

export async function retainToolInstructions(
  instructions: NonNullable<RuntimeToolResult['instructions']>,
  api: ToolExecutionApi,
  context: Context,
): Promise<void> {
  await api.commit((tx) => retainToolInstructionsTx(tx, api.conversationId, instructions), context);
}

export function hasToolInstructions(
  key: string,
  api: Pick<HookApi, 'conversationId' | 'snapshot'>,
  context: Context,
  expectedText?: string,
): Promise<boolean> {
  return api
    .snapshot(ToolInstructions, api.conversationId, context)
    .then(
      (document) =>
        document?.sections.some(
          (section) =>
            section.key === key && (expectedText === undefined || section.text === expectedText),
        ) ?? false,
    );
}

const SKILL_INSTRUCTION_REVISION_PATTERN = /\(skill_id: [^;\n]+; revision ([0-9a-f]{12})\)/;

export function parseRetainedSkillRevision(text: string): string | undefined {
  return SKILL_INSTRUCTION_REVISION_PATTERN.exec(text)?.[1];
}
