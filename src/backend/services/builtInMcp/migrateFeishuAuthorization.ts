import * as SecureStore from 'expo-secure-store';
import * as z from 'zod';

import type { PluginAuthorizationStore } from '@/backend/data/services/PluginAuthorizationService';

import { FeishuAuthorizationStateSchema, FeishuWaitingSchema } from './feishuAuthorizationState';
import { FeishuApplicationSchema, FeishuTokensSchema } from './feishuOauth';

const LEGACY_KEYS = [
  'plugins.feishu.authorization.v1',
  'plugins.feishu.application.v1',
  'plugins.feishu.grant.v1',
  'plugins.feishu.pending.v1',
] as const;
const LegacyGrantSchema = z.object({
  id: z.string().uuid(),
  application: FeishuApplicationSchema,
  tokens: FeishuTokensSchema,
});
const LegacyStateSchema = z.object({
  application: FeishuApplicationSchema.optional(),
  current: LegacyGrantSchema.optional(),
  pending: z
    .discriminatedUnion('status', [
      FeishuWaitingSchema,
      z.object({ status: z.literal('ready'), grant: LegacyGrantSchema }),
      z.object({
        status: z.enum(['expired', 'denied', 'unsupported-account']),
        id: z.string().uuid(),
      }),
    ])
    .optional(),
});

/** One-way upgrade only. SQLite is authoritative before any legacy key is removed. */
export async function migrateFeishuAuthorization(store: PluginAuthorizationStore) {
  if (!(await store.readState())) {
    const values = await Promise.all(LEGACY_KEYS.map((key) => SecureStore.getItemAsync(key)));
    const [combined, application, current, pending] = values.map((value) =>
      value ? JSON.parse(value) : undefined,
    );
    // Split storage replaced the combined item; never resurrect stale parts from both layouts.
    const legacy = LegacyStateSchema.parse(
      values.slice(1).some((value) => value !== null)
        ? { application, current, pending }
        : (combined ?? {}),
    );
    const grant = await store.getGrant();
    const candidates = [
      legacy.current,
      legacy.pending?.status === 'ready' ? legacy.pending.grant : undefined,
    ];
    const committed = candidates.find(
      (candidate) =>
        candidate && grant?.credential.legacyReference === `feishu-user:${candidate.id}`,
    );
    const state = FeishuAuthorizationStateSchema.parse({
      version: 1,
      application: legacy.application,
      pending:
        legacy.pending?.status === 'ready'
          ? committed?.id === legacy.pending.grant.id
            ? undefined
            : {
                status: 'ready',
                id: legacy.pending.grant.id,
                credential: {
                  version: 1,
                  application: legacy.pending.grant.application,
                  tokens: legacy.pending.grant.tokens,
                },
              }
          : legacy.pending,
    });
    await store.initializeState(
      JSON.parse(JSON.stringify(state)),
      committed && grant
        ? {
            previous: grant,
            credential: JSON.parse(
              JSON.stringify({
                version: 1,
                application: committed.application,
                tokens: committed.tokens,
              }),
            ),
          }
        : undefined,
    );
  }
  // A cleanup failure must not make an already committed SQLite authorization unavailable.
  // Retrying at the next runtime creation also finishes a process interruption after the commit.
  await Promise.all(
    LEGACY_KEYS.map((key) => SecureStore.deleteItemAsync(key).catch(() => undefined)),
  );
}
