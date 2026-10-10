import * as z from 'zod';

import { BuiltInMcpIdSchema } from './mcpServer';

export const PluginIdSchema = BuiltInMcpIdSchema;
export type PluginId = z.infer<typeof PluginIdSchema>;

/** Explicit plugin mention and display snapshot; never grants tool access. Offsets use UTF-16. */
export const PluginTextReferenceSchema = z.strictObject({
  type: z.literal('plugin'),
  pluginId: PluginIdSchema,
  label: z.string().min(1),
  offset: z.number().int().nonnegative(),
});
export type PluginTextReference = z.infer<typeof PluginTextReferenceSchema>;

/** Validation rules for one credential input; its label and error copy live in locale files. */
export type PluginCredentialField = {
  readonly id: string;
  readonly secret: boolean;
  readonly maxLength: number;
  readonly pattern?: string;
  /** Inline fallback label, used by catalog plugins that carry no locale entry. */
  readonly label?: string;
  readonly errorLabel?: string;
};

export type PluginCredentialMethod = {
  readonly id: string;
  readonly kind: 'credentials';
  readonly fields: readonly PluginCredentialField[];
  readonly requiresDisconnect?: boolean;
  /** Inline fallback method copy, used by catalog plugins that carry no locale entry. */
  readonly label?: string;
  readonly setup?: string;
};

/** Browser interaction is explicit; application entry is optional. */
export type PluginInteractiveMethod = {
  readonly id: string;
  readonly kind: 'interactive';
  readonly interaction: 'polling' | 'callback';
  readonly stages: readonly string[];
  readonly applicationFields?: readonly PluginCredentialField[];
  /** Inline fallback method copy, used by catalog plugins that carry no locale entry. */
  readonly label?: string;
  readonly setup?: string;
  readonly permissions?: string;
};

export type PluginAuthorizationMethod = PluginCredentialMethod | PluginInteractiveMethod;

/**
 * Safe catalog projection: no credentials, executable code, or transport configuration.
 * Display copy is translated under `plugins.catalog.<id>`; the guide preview retains its authored text.
 */
export type PluginCatalogEntry = {
  readonly id: PluginId;
  readonly icon?: string;
  /**
   * Authored display name and one-line summary. The curated remote-MCP catalog
   * carries these inline so adding a hosted server is a data entry, not a
   * translation pass across every locale; entries that omit them fall back to
   * `plugins.catalog.<id>.name` / `.summary`.
   */
  readonly name?: string;
  readonly summary?: string;
  readonly category?: string;
  /** Longer setup copy shown on the detail screen; falls back to `plugins.catalog.<id>.description`. */
  readonly description?: string;
  /** Credential-link label; falls back to `plugins.catalog.<id>.credentialLink`. */
  readonly credentialLink?: string;
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
