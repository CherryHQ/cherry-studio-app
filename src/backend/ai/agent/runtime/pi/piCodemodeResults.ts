import { defineEntry } from '@earendil-works/pi-durable';

import type { RuntimeSkillScopeChange } from '../durableTypes';
import type { RuntimeJsonValue } from '../types';

/** App results outlive the parent's task documents without entering model history. */
export const PiCodemodeMcpResultEntry = defineEntry<{
  parentCallId: string;
  callId: string;
  ref: { source: 'mcp'; serverId: string; rawToolName: string };
  providerName: string;
  displayName: string;
  input: RuntimeJsonValue;
  output: RuntimeJsonValue;
}>('cherry.codemode-mcp-result');

/**
 * Skill scope mutations committed atomically with ToolInstructions, surviving suspend/restart
 * for both direct calls (`parentCallId === callId`) and nested Code Mode calls.
 */
export const PiCodemodeSkillScopeEntry = defineEntry<{
  parentCallId: string;
  callId: string;
  change: RuntimeSkillScopeChange;
}>('cherry.codemode-skill-scope');
