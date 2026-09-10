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

/** Backend-only logical payload; native storage holds values, SQLite holds opaque references. */
export const PluginCredentialSchema = z.record(z.string(), z.json());
export type PluginCredential = z.infer<typeof PluginCredentialSchema>;

export type PluginCredentialMethod = {
  readonly id: string;
  readonly kind: 'credentials';
  readonly fields: readonly PluginCredentialField[];
};

export type PluginInteractiveMethod = {
  readonly id: string;
  readonly kind: 'interactive';
  readonly stages: readonly string[];
  readonly applicationFields?: readonly PluginCredentialField[];
};

export type PluginAuthorizationMethod = PluginCredentialMethod | PluginInteractiveMethod;

/**
 * Safe catalog projection: no credentials, executable code, or transport configuration.
 * Display copy is translated under `plugins.catalog.<id>` so every string has one source.
 */
export type PluginCatalogEntry = {
  readonly id: PluginId;
  readonly icon?: string;
  readonly links: {
    readonly credentials: string;
    readonly website: string;
    readonly privacy: string;
  };
  readonly authMethods: readonly PluginAuthorizationMethod[];
};

/** Public connection metadata; credentials remain backend-owned. */
export type PluginConnection = {
  pluginId: PluginId;
  serverId: string;
  accountLabel: string;
  connectedAt: string;
};
