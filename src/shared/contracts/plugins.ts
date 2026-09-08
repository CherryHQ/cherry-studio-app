import * as z from 'zod';

export const PluginIdSchema = z.enum(['github', 'amap']);
export type PluginId = z.infer<typeof PluginIdSchema>;

export const ConnectPluginSchema = z.strictObject({
  pluginId: PluginIdSchema,
  credential: z.string().trim().min(1).max(4096).regex(/^\S+$/),
});

/** Public projection; credentials and ciphertext never cross this boundary. */
export type PluginConnection = {
  pluginId: PluginId;
  serverId: string;
  accountLabel: string;
  connectedAt: string;
};

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
  listConnections(): Promise<PluginConnection[]>;
  connect(
    input: z.infer<typeof ConnectPluginSchema>,
    signal?: AbortSignal,
  ): Promise<PluginConnection>;
  disconnect(pluginId: PluginId): Promise<void>;
}
