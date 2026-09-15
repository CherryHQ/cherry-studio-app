import * as z from 'zod';

/** Backend-only secret payload. Each plugin validates its own versioned format. */
export const PluginCredentialSchema = z.record(z.string(), z.json());
export type PluginCredential = z.infer<typeof PluginCredentialSchema>;

/** A resolved grant contains secret values, never a native-storage reference. */
export type PluginGrant = { id: string; credential: PluginCredential };
