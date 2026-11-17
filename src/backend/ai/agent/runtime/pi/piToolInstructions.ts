import type { Context } from '@earendil-works/chord';
import type { Message } from '@earendil-works/pi-ai';
import {
  defineDoc,
  type HookApi,
  section,
  type ToolExecutionApi,
} from '@earendil-works/pi-durable';
import { z } from 'zod';

import type { RuntimeToolResult } from '../types';

// Identity files can expand sixfold when escaped; the engine owns model budgets.
export const MAX_TOOL_INSTRUCTION_CHARACTERS = 32 * 1024 * 1024;

const instructionsSchema = z.strictObject({
  key: z.string().min(1).max(256),
  text: z.string().min(1).max(MAX_TOOL_INSTRUCTION_CHARACTERS),
});

const SECTION_KEY = 'cherry-tool-instructions';

function checkedSections(sections: { key: string; text: string }[]) {
  if (
    sections.length > 64 ||
    sections.reduce((size, entry) => size + entry.text.length, 0) > MAX_TOOL_INSTRUCTION_CHARACTERS
  )
    throw new Error('The retained tool instruction budget is full.');
  return sections;
}

/** Current execution only; the Host rebuilds applicable instructions for the next configuration. */
export const ToolInstructions = defineDoc<{ sections: { key: string; text: string }[] }>({
  kind: 'cherry.tool-instructions',
  version: 1,
  scope: 'conversation',
  checkpointWhen: () => false,
  history: 'latest',
  fork: 'initial',
  initial: () => ({ sections: [] }),
});

/** Native sections render committed state before every request, including after compaction/reopen. */
export const toolInstructionsSection = section(
  SECTION_KEY,
  async (input, context) => {
    const document = await input.read.snapshot(ToolInstructions, input.conversationId, context);
    return document?.sections.length
      ? document.sections.map(({ text }) => text).join('\n\n')
      : undefined;
  },
  { tag: false },
);

export async function retainToolInstructions(
  instructions: NonNullable<RuntimeToolResult['instructions']>,
  api: ToolExecutionApi,
  context: Context,
): Promise<void> {
  const parsed = instructionsSchema.parse(instructions);
  await api.commit(async (tx) => {
    const document = await tx.doc(ToolInstructions, api.conversationId);
    const sections = document.sections.filter(({ key }) => key !== parsed.key);
    sections.push(parsed);
    // Bounded independently of the compactable tool result, including concurrent tool loads.
    document.sections = checkedSections(sections);
  }, context);
}

/** Only native section metadata changes; user text and other system sections are never searched. */
export function replaceRequestInstructions(
  messages: readonly Message[],
  retained: readonly { key: string; text: string }[],
  updates: readonly { key: string; text: string }[],
): readonly Message[] {
  if (!updates.length) return messages;
  const current = new Map(retained.map((entry) => [entry.key, entry]));
  for (const update of updates) {
    const parsed = instructionsSchema.parse(update);
    current.set(parsed.key, parsed);
  }
  const text = checkedSections([...current.values()])
    .map((entry) => entry.text)
    .join('\n\n');
  // Older patches may carry withdrawn Host context. Retain the current document once, rather
  // than leaving superseded text in providers which accept system changes mid-conversation.
  const next = messages.map((message) => {
    if (message.role !== 'system' || !message.sections || !(SECTION_KEY in message.sections))
      return message;
    const sections = { ...message.sections };
    delete sections[SECTION_KEY];
    return { ...message, sections };
  });
  return [
    ...next,
    {
      role: 'system',
      content: '',
      sections: { [SECTION_KEY]: text },
      timestamp: messages.at(-1)?.timestamp ?? 0,
    },
  ];
}

export async function refreshRequestInstructions(
  messages: readonly Message[],
  updates: readonly { key: string; text: string }[],
  api: HookApi,
  context: Context,
) {
  const document = await api.snapshot(ToolInstructions, api.conversationId, context);
  return replaceRequestInstructions(messages, document?.sections ?? [], updates);
}

export async function hasToolInstructions(
  key: string,
  api: HookApi,
  context: Context,
): Promise<boolean> {
  const document = await api.snapshot(ToolInstructions, api.conversationId, context);
  return document?.sections.some((section) => section.key === key) ?? false;
}
