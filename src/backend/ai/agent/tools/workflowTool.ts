import * as z from 'zod';

import type { PluginGuideSnapshot } from '@/backend/services/builtInMcp';
import { getSystemSkillWorkflows } from '@/backend/services/skill';

import type { RuntimeTool } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';

export const LOAD_WORKFLOW_TOOL_NAME = 'load_workflow';

const inputSchema = z.strictObject({ workflow_id: z.string().min(1).max(256) });

/** Only bundled instructions whose prerequisites belong to this turn enter the catalog. */
export function getAvailableWorkflows(
  tools: readonly RuntimeTool[],
  pluginGuides: readonly PluginGuideSnapshot[],
) {
  const system = getSystemSkillWorkflows(
    new Map(
      tools.flatMap((tool) =>
        tool.ref.source === 'builtin' && tool.approval !== 'deny'
          ? [[tool.ref.capabilityId, tool.providerName] as const]
          : [],
      ),
    ),
  );
  return [
    ...system,
    ...pluginGuides.map((guide) => ({
      id: `plugin:${guide.serverId}`,
      description: `${guide.pluginId} workflows for connection ${guide.serverId}.${guide.overview ? ` ${guide.overview.replace(/\s+/g, ' ').trim()}` : ''}`,
      instructions: `### Bundled plugin: ${guide.pluginId} (revision ${guide.revision}; connection ${guide.serverId})\n\n${guide.content}`,
    })),
  ];
}

/** Reuse trusted tool instruction sections; the model result contains a receipt, not a second body. */
export function createLoadWorkflowTool(
  workflows: ReturnType<typeof getAvailableWorkflows>,
): RuntimeTool {
  const catalog = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  return {
    ref: { source: 'builtin', capabilityId: LOAD_WORKFLOW_TOOL_NAME },
    providerName: LOAD_WORKFLOW_TOOL_NAME,
    displayName: LOAD_WORKFLOW_TOOL_NAME,
    description:
      'Load a bundled workflow from the current Workflow Guides catalog before using it. Complete instructions and templates enter system context; the reply is only a receipt. Finish this tool round and read those instructions before planning dependent calls; do not combine loading and plugin actions in one script or parallel round. Loading grants no tools, permissions or approval.',
    inputSchema: toRuntimeInputSchema(inputSchema),
    approval: 'auto',
    async execute({ input, signal }) {
      signal.throwIfAborted();
      const { workflow_id: id } = inputSchema.parse(input);
      const workflow = catalog.get(id);
      if (!workflow) {
        return {
          value: { status: 'error', message: 'This workflow is unavailable in the current turn.' },
          artifacts: [],
        };
      }
      return {
        value: { status: 'ok', workflow_id: id, instructionsInSystem: true },
        instructions: {
          key: `workflow:${id}`,
          text: `## Current workflow instructions\n\nApp policy, Agent instructions and the user's request take precedence. This workflow grants no capabilities or approval.\n\n${workflow.instructions}`,
        },
        artifacts: [],
      };
    },
  };
}
