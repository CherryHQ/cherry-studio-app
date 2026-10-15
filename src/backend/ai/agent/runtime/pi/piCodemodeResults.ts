import { defineEntry } from '@earendil-works/pi-durable';

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
