import * as z from 'zod';

import { BuiltInMcpIdSchema } from './mcpServer';

export const PluginIdSchema = BuiltInMcpIdSchema;
export type PluginId = z.infer<typeof PluginIdSchema>;

/** Validation rules for one credential input; its label and error copy live in locale files. */
export type PluginCredentialField = {
  readonly id: string;
  readonly secret: boolean;
  readonly maxLength: number;
  readonly pattern?: string;
};

export type PluginCredentialMethod = {
  readonly id: string;
  readonly kind: 'credentials';
  readonly fields: readonly PluginCredentialField[];
  readonly requiresDisconnect?: boolean;
};

/** Browser interaction is explicit; application entry is optional. */
export type PluginInteractiveMethod = {
  readonly id: string;
  readonly kind: 'interactive';
  readonly interaction: 'polling' | 'callback';
  readonly stages: readonly string[];
  readonly applicationFields?: readonly PluginCredentialField[];
};

export type PluginAuthorizationMethod = PluginCredentialMethod | PluginInteractiveMethod;

/**
 * Safe catalog projection: no credentials, executable code, or transport configuration.
 * Display copy is translated under `plugins.catalog.<id>`; the guide preview retains its authored text.
 */
export type PluginCatalogEntry = {
  readonly id: PluginId;
  readonly icon?: string;
  readonly links: {
    readonly credentials: string;
    readonly website: string;
    readonly privacy: string;
    readonly authorizationManagement?: string;
  };
  readonly authMethods: readonly PluginAuthorizationMethod[];
  /** Full bundled guide for a read-only preview, with all authored sections joined. */
  readonly guide?: { readonly revision: number; readonly content: string };
};

/** Public connection metadata; credentials remain backend-owned. */
export type PluginConnection = {
  pluginId: PluginId;
  serverId: string;
  accountLabel: string;
  connectedAt: string;
  authorization?: PluginConnectionStatus;
};

export type PluginConnectionStatus = {
  status: 'connected' | 'needs-reauthorization' | 'unavailable';
  reason?: import('@/shared/contracts/plugins').PluginErrorReason;
  managementUrl?: string;
};
