import * as z from 'zod';

import { BuiltInMcpIdSchema } from './mcpServer';

export const PluginIdSchema = BuiltInMcpIdSchema;
export type PluginId = z.infer<typeof PluginIdSchema>;

/** Plugin-owned copy, with a required fallback and optional language tags. */
export type PluginText = Readonly<{ default: string } & Record<string, string>>;

export type PluginCredentialField = {
  readonly id: string;
  readonly label: PluginText;
  readonly error: PluginText;
  readonly secret: boolean;
  readonly maxLength: number;
  readonly pattern?: string;
};

/** Safe catalog projection: no credentials, executable code, or transport configuration. */
export type PluginCatalogEntry = {
  readonly id: PluginId;
  readonly name: PluginText;
  readonly summary: PluginText;
  readonly description: PluginText;
  readonly access: PluginText;
  readonly setup: PluginText;
  readonly credentialLinkLabel: PluginText;
  readonly icon?: string;
  readonly links: {
    readonly credentials: string;
    readonly website: string;
    readonly privacy: string;
  };
  readonly credentialFields: readonly PluginCredentialField[];
};

/** Public connection metadata; credentials remain backend-owned. */
export type PluginConnection = {
  pluginId: PluginId;
  serverId: string;
  accountLabel: string;
  connectedAt: string;
};
