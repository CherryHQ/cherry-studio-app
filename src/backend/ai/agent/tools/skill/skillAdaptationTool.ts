import * as z from 'zod';

import { SkillsError, type SkillTextChange, type SkillsModule } from '@/shared/contracts/skills';
import type { AppLanguage } from '@/shared/utils/languages';

import type { SkillScopeSource, SkillTurnEntry, SkillTurnScope } from '../../host/skillScope';
import type { RuntimeTool, RuntimeToolResult } from '../../runtime';
import type { AskUserQuestion } from '../askUserQuestionTool';
import { toRuntimeInputSchema } from '../runtimeToolSchema';
import { skillAdaptationQuestion } from './skillAdaptationQuestion';

const inputSchema = z.strictObject({
  skill_id: z.string().min(1),
  changes: z
    .array(
      z.strictObject({
        before: z
          .string()
          .min(1)
          .max(4000)
          .describe('Exact, unique passage from the current SKILL.md body.'),
        after: z
          .string()
          .max(4000)
          .describe('Replacement passage, or empty only for an explicitly optional step.'),
        reason: z
          .string()
          .trim()
          .min(1)
          .max(300)
          .describe('Explain the unsupported step and replacement in the user’s language.'),
        kind: z.enum(['replace-execution', 'remove-optional']),
        replacement_tools: z
          .array(z.string().min(1))
          .max(8)
          .describe('Exact exposed tool names used by the replacement; empty for removal.'),
      }),
    )
    .min(1)
    .max(3),
});

export type SkillAdaptationToolOptions = {
  workflow: Pick<SkillsModule, 'previewAdaptation' | 'adapt'>;
  source: SkillScopeSource;
  context: Omit<Parameters<SkillScopeSource['resolve']>[0], 'signal'>;
  askUser: AskUserQuestion;
  language: AppLanguage;
  replace(scope: SkillTurnScope, skillId: string, digest: string): boolean;
};

export function createSkillAdaptationTool(
  scope: SkillTurnScope,
  options: SkillAdaptationToolOptions & {
    isLoaded(id: string): boolean;
    canReplace(id: string, instructionCharacters: number): boolean;
    activate(entry: SkillTurnEntry, instructions: string): RuntimeToolResult;
  },
): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: 'adapt_skill' },
    providerName: 'adapt_skill',
    displayName: 'Adapt local Skill',
    approval: 'auto',
    description:
      'Propose up to three small edits to a loaded local SKILL.md when desktop execution is structurally unavailable. The app shows the exact before/after text in its existing question sheet and always waits for explicit consent, including auto mode. Do not ask separately. Preserves metadata, other files, and at least two thirds of the body. Only replace execution using verified available tools, or remove an explicitly optional step. Preserve the goal, output, data scope, checks and approvals. Never remove a core capability to claim success, or delete a step due to disabled tools, permissions, missing configuration or a transient failure. Saves the one current local Skill for all bound Agents, reloads its instructions, then continue the original task. No tools or permissions are granted.',
    inputSchema: toRuntimeInputSchema(inputSchema),
    async execute(call): Promise<RuntimeToolResult> {
      try {
        const parsed = inputSchema.parse(call.input);
        const entry = scope.entries.find((item) => item.id === parsed.skill_id);
        if (!entry || !options.isLoaded(entry.id))
          throw new SkillsError(
            'not-found',
            'Read this available Skill before proposing an adaptation.',
          );
        const availableTools = new Set(
          options.context.tools
            .filter((tool) => tool.approval !== 'deny')
            .map((tool) => tool.providerName),
        );
        for (const change of parsed.changes) {
          if (change.kind === 'remove-optional') {
            if (
              change.after.trim() ||
              change.replacement_tools.length ||
              !/\boptional\b|可选|可選|任意|facultatif|opcional|optional|необязательн|προαιρετικ|tùy chọn|isteğe bağlı/i.test(
                change.before,
              )
            )
              throw new SkillsError(
                'package-invalid',
                'Only an explicitly optional passage can be removed.',
              );
          } else if (
            !change.after.trim() ||
            !change.replacement_tools.length ||
            change.replacement_tools.some((name) => !availableTools.has(name))
          ) {
            throw new SkillsError(
              'admission-unsupported',
              'Every replacement must use verified tools exposed in this turn.',
            );
          }
        }
        const changes: SkillTextChange[] = parsed.changes.map(({ before, after, reason }) => ({
          before,
          after,
          reason,
        }));
        const input = { skillId: entry.id, expectedContentHash: entry.contentHash, changes };
        const preview = await options.workflow.previewAdaptation(input, call.signal);
        const current = await scope.readInstructions(entry.id);
        if (current === null || !current.endsWith(preview.previousInstructions))
          throw new SkillsError(
            'content-changed',
            'Read the current local Skill before adapting it.',
          );
        const next =
          current.slice(0, current.length - preview.previousInstructions.length) +
          preview.instructions;
        if (!options.canReplace(entry.id, [...next].length))
          throw new SkillsError(
            'package-too-large',
            'The adapted instructions exceed the active Skill budget.',
          );
        const response = await options.askUser(
          skillAdaptationQuestion(options.language, entry.name, changes),
          call,
        );
        const answer = response.answers.find((item) => item.questionId === 'skill-adaptation');
        if (
          !answer ||
          answer.skipped ||
          answer.selectedOptionIds.length !== 1 ||
          answer.selectedOptionIds[0] !== 'adapt' ||
          answer.text.trim()
        )
          return {
            value: {
              status: 'unchanged',
              skill_id: entry.id,
              name: entry.name,
              changes,
              answers: response.answers,
              next: 'No local files changed. Respect the decision. Only revise the proposal if the user explicitly requested different changes.',
            },
            artifacts: [],
          };
        call.signal.throwIfAborted();
        const beforeSave = await options.source.resolve({
          ...options.context,
          signal: call.signal,
        });
        if (
          !beforeSave.entries.some(
            (item) => item.id === entry.id && item.contentHash === entry.contentHash,
          )
        )
          throw new SkillsError(
            'content-changed',
            'The Skill changed or is no longer enabled for this Agent. Review a new proposal.',
          );
        const skill = await options.workflow.adapt(input, call.signal);
        // Preserve the saved receipt even when refreshing this turn fails after the commit.
        let activated: RuntimeToolResult | undefined;
        try {
          const checked = await options.source.resolve({ ...options.context, signal: call.signal });
          const updated = checked.entries.find(
            (item) => item.id === skill.id && item.contentHash === skill.contentHash,
          );
          const instructions = updated ? await checked.readInstructions(skill.id) : null;
          if (
            updated &&
            instructions !== null &&
            options.canReplace(skill.id, [...instructions].length) &&
            options.replace(checked, skill.id, skill.contentHash)
          )
            activated = options.activate(updated, instructions);
        } catch {
          /* Local save remains effective; explain the reload limitation in the receipt. */
        }
        const receipt = {
          status: 'adapted',
          skill_id: skill.id,
          name: skill.name,
          changes,
          instructionsLoaded: Boolean(activated),
          next: activated
            ? 'The local Skill was saved and its current system instructions replaced. Continue the original task with the new instructions; this receipt alone is not task completion.'
            : 'The local Skill was saved, but instructions could not be reloaded. Stop Skill execution for this turn and explain that a new turn is needed.',
        };
        return {
          value: receipt,
          modelValue: receipt,
          instructions: activated?.instructions,
          ...(activated
            ? {
                instructionsFailureValue: {
                  ...receipt,
                  instructionsLoaded: false,
                  next: 'The local Skill was saved, but its system instructions could not be replaced. Stop Skill execution for this turn and explain that a new message is needed.',
                },
              }
            : {}),
          artifacts: [],
        };
      } catch (error) {
        call.signal.throwIfAborted();
        return {
          value: {
            status: 'error',
            code: error instanceof SkillsError ? error.code : 'package-invalid',
            message:
              error instanceof SkillsError
                ? error.message
                : 'The local Skill could not be adapted.',
          },
          artifacts: [],
        };
      }
    },
  };
}
