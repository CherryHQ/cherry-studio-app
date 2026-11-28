import * as z from 'zod';

import type { PluginGuideSnapshot } from '@/backend/services/builtInMcp';

import type { RuntimeTool, RuntimeToolResult } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';

export const LOAD_WORKFLOW_TOOL_NAME = 'load_workflow';

const inputSchema = z.strictObject({ workflow_id: z.string().min(1).max(256) });

export type PluginWorkflow = {
  id: string;
  serverId: string;
  description: string;
  instructions: { key: string; text: string };
};

/** One loadable guide per connection whose tools are in this turn. */
export function getPluginWorkflows(pluginGuides: readonly PluginGuideSnapshot[]): PluginWorkflow[] {
  return pluginGuides.map((guide) => {
    const id = `plugin:${guide.serverId}`;
    return {
      id,
      serverId: guide.serverId,
      description: `${guide.pluginId} workflows for connection ${guide.serverId}.${guide.overview ? ` ${guide.overview.replace(/\s+/g, ' ').trim()}` : ''}`,
      instructions: {
        key: `workflow:${id}`,
        text: `## Current workflow instructions\n\nApp policy, Agent instructions and the user's request take precedence. This workflow grants no capabilities or approval.\n\n### Bundled plugin: ${guide.pluginId} (revision ${guide.revision}; connection ${guide.serverId})\n\n${guide.content}`,
      },
    };
  });
}

/** Guides loaded earlier in the Session stay in system context while their connection remains. */
export function restoreLoadedWorkflows(
  workflows: readonly PluginWorkflow[],
  loadedIds: readonly string[],
) {
  const loaded = new Set(loadedIds);
  return workflows.flatMap((workflow) => (loaded.has(workflow.id) ? [workflow.instructions] : []));
}

/** A connection's tools refuse to run until its guide is in system context, before any approval. */
export function requireLoadedWorkflows(
  tools: readonly RuntimeTool[],
  workflows: readonly PluginWorkflow[],
): RuntimeTool[] {
  const byServer = new Map(workflows.map((workflow) => [workflow.serverId, workflow]));
  return tools.map((tool) => {
    const workflow = tool.ref.source === 'mcp' ? byServer.get(tool.ref.serverId) : undefined;
    return workflow
      ? {
          ...tool,
          requiredInstructions: {
            key: workflow.instructions.key,
            refusal: `Call ${LOAD_WORKFLOW_TOOL_NAME} with workflow_id "${workflow.id}" and read the supplied instructions before using this connection's tools.`,
          },
        }
      : tool;
  });
}

/** Reuse trusted tool instruction sections; the model result contains a receipt, not a second body. */
export function createLoadWorkflowTool(workflows: readonly PluginWorkflow[]): RuntimeTool {
  const catalog = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  return {
    ref: { source: 'builtin', capabilityId: LOAD_WORKFLOW_TOOL_NAME },
    providerName: LOAD_WORKFLOW_TOOL_NAME,
    displayName: LOAD_WORKFLOW_TOOL_NAME,
    description:
      'Load a plugin connection guide from the current Plugin Guides catalog before using its tools. Complete instructions enter system context and stay there for later turns; the reply is only a receipt. Finish this tool round and read those instructions before planning dependent calls; do not combine loading and plugin actions in one script or parallel round. Loading grants no tools, permissions or approval.',
    inputSchema: toRuntimeInputSchema(inputSchema),
    approval: 'auto',
    async execute({ input, signal }): Promise<RuntimeToolResult> {
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
        instructions: workflow.instructions,
        artifacts: [],
      };
    },
  };
}
