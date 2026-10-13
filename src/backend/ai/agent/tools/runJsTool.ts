/**
 * `run_js`: the JavaScript capability an Agent can enable.
 *
 * The capability owns the setting, the approval policy and the transcript identity. Pi's Code Mode
 * executes it (docs/references/agent/agent-tools-and-resources.md): the Runtime registers the
 * upstream script tool in this capability's place, so a client without the interactive native
 * bridge offers no JavaScript capability at all.
 */

import type { RuntimeTool } from '../runtime';

export const RUN_JS_TOOL_NAME = 'run_js';

export function createRunJsTool(): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: RUN_JS_TOOL_NAME },
    providerName: RUN_JS_TOOL_NAME,
    displayName: 'Run JavaScript',
    description: 'Run JavaScript that computes and calls the available tools.',
    inputSchema: { type: 'object' },
    // The catalog overrides this from the resolved binding policy; the value
    // here is only the floor this tool declares for itself.
    approval: 'auto',
    async execute() {
      throw new Error('JavaScript runs through Code Mode.');
    },
  };
}
