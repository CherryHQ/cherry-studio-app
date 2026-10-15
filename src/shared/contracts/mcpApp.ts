import type { McpAppSandboxPolicy } from '@cherrystudio/mcp-app-webview';
import * as z from 'zod';

import type { JsonValue } from './agent';

/** Host-issued linkage; never taken from a tool's returned JSON. */
export const McpAppReferenceSchema = z.strictObject({
  serverId: z.string().min(1),
  agentId: z.string().min(1).optional(),
  toolName: z.string().min(1).max(512),
  resourceUri: z.string().startsWith('ui://').max(8192),
  connectionKey: z.string().regex(/^remote:[a-f0-9]{64}$/),
});
export type McpAppReference = z.infer<typeof McpAppReferenceSchema>;
export type McpAppHostContext = {
  theme: 'light' | 'dark';
  locale: string;
  containerDimensions: { width: number; height: number };
};
export type McpAppLaunch = {
  reference: McpAppReference;
  input: JsonValue;
  result: JsonValue;
  hostContext: McpAppHostContext;
};
/** Only native owners implement these callbacks; the iframe never receives them. */
export type McpAppChannel = {
  send(message: string): void;
  openLink(url: string): Promise<void>;
  /** Stage a reviewed user message; it is not a new automatic agent turn. */
  message(text: string): Promise<void>;
  /** Latest context replaces this view's prior context for the next user submission. */
  updateContext(text: string): void;
  closed(): void;
};
export type McpAppView = {
  id: string;
  title: string;
  html: string;
  policy: McpAppSandboxPolicy;
};
