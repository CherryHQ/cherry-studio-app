import * as z from 'zod';

export const PluginIdSchema = z.enum(['github', 'amap']);
export type PluginId = z.infer<typeof PluginIdSchema>;

/** Public connection metadata; credentials remain backend-owned. */
export type PluginConnection = {
  pluginId: PluginId;
  serverId: string;
  accountLabel: string;
  connectedAt: string;
};
