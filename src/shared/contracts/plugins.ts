import * as z from 'zod';

import { type PluginConnection, type PluginId, PluginIdSchema } from '@/shared/data/types/plugin';

export const ConnectPluginSchema = z.strictObject({
  pluginId: PluginIdSchema,
  credential: z.string().trim().min(1).max(4096).regex(/^\S+$/),
});

export type PluginErrorReason =
  | 'authorization'
  | 'access'
  | 'quota'
  | 'network'
  | 'request'
  | 'unknown-write'
  | 'cancelled'
  | 'storage';

/** Safe diagnostics for tools; UI translates the closed reason instead of the message. */
export class PluginError extends Error {
  constructor(
    public readonly reason: PluginErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'PluginError';
    this.stack = undefined;
  }
}

export interface PluginsModule {
  connect(
    input: z.infer<typeof ConnectPluginSchema>,
    signal?: AbortSignal,
  ): Promise<PluginConnection>;
  disconnect(pluginId: PluginId): Promise<void>;
}
