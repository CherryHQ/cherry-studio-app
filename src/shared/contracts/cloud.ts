import * as z from 'zod';

export const CLOUD_PROVIDER_ID = 'cherryai-subscription';
export type CloudModelUse = 'agent' | 'general';

const UnitsSchema = z.number().int().nonnegative();
export const CloudQuotaWindowSchema = z.object({
  window_type: z.enum(['rolling', 'calendar_day', 'subscription_month']),
  duration_seconds: z.number().int().positive(),
  limit_units: UnitsSchema,
  used_units: UnitsSchema,
  active_reserved_units: UnitsSchema,
  remaining_units: UnitsSchema,
  next_recovery_at: z.iso.datetime().optional(),
  period_start: z.iso.datetime().optional(),
  period_end: z.iso.datetime().optional(),
});
export const CloudQuotaPoolSchema = z
  .object({
    allocation_id: z.string().min(1),
    display_name: z.string(),
    measurement_kind: z.enum(['money', 'requests']),
    currency: z.enum(['CNY', 'USD']).optional(),
    model_ids: z.array(z.string()),
    windows: z.array(CloudQuotaWindowSchema),
  })
  .refine(
    (pool) => pool.measurement_kind !== 'money' || pool.currency !== undefined,
    'Money pools require a currency',
  );
const PlanSchema = z.object({
  id: z.string().min(1),
  display_name: z.string(),
  is_free: z.boolean(),
  subscription_price: z
    .object({
      product_name: z.string(),
      currency: z.string().regex(/^[A-Za-z]{3}$/),
      interval: z.string(),
      unit_amount: UnitsSchema,
    })
    .optional(),
});
export const CloudPlansSchema = z.object({
  measured_at: z.iso.datetime(),
  entitlements: z.array(
    z.object({
      id: z.string().min(1),
      plan: PlanSchema,
      state: z.enum(['active', 'upcoming', 'expired', 'disabled']),
      starts_at: z.iso.datetime(),
      expires_at: z.iso.datetime().optional(),
      quota_pools: z.array(CloudQuotaPoolSchema),
    }),
  ),
});
export const CloudAccountSchema = z.object({
  measured_at: z.iso.datetime(),
  account: z.object({ id: z.string().min(1), status: z.enum(['active', 'disabled']) }),
  device: z.object({ id: z.string().min(1) }),
  entitlements: z.array(
    z.object({
      plan_id: z.string(),
      is_free: z.boolean(),
      status: z.enum(['inactive', 'active', 'expired']),
      model_ids: z.array(z.string()),
      starts_at: z.iso.datetime().optional(),
      expires_at: z.iso.datetime().optional(),
    }),
  ),
  quota_pools: z.array(CloudQuotaPoolSchema),
});
export const CloudModelSchema = z.object({
  id: z.string().min(1),
  display_name: z.string(),
  endpoint_type: z.enum(['anthropic-messages', 'openai-chat-completions']),
  context_window: z.number().int().positive(),
  max_output_tokens: z.number().int().positive(),
  capabilities: z.array(z.string()),
  available_features: z.array(z.string()),
});
export type CloudModel = z.infer<typeof CloudModelSchema>;
export type CloudAccount = z.infer<typeof CloudAccountSchema>;
export type CloudPlans = z.infer<typeof CloudPlansSchema>;
export type CloudQuotaPool = z.infer<typeof CloudQuotaPoolSchema>;
export type CloudQuotaWindow = z.infer<typeof CloudQuotaWindowSchema>;
export type CloudUnavailableReason =
  | 'signed_out'
  | 'unavailable'
  | 'not_entitled'
  | 'quota_exhausted';
export type CloudState = Readonly<{
  phase: 'signed_out' | 'loading' | 'ready' | 'error';
  isRefreshing: boolean;
  account: CloudAccount | null;
  plans: CloudPlans | null;
  models: readonly CloudModel[];
}>;
export interface CloudModule {
  getState(): CloudState;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
}

/** Windows constrain the same pool; independent pools are alternative sources of credit. */
export function cloudModelUnavailable(
  state: CloudState,
  modelId: string,
  use: CloudModelUse,
  now = Date.now(),
): CloudUnavailableReason | undefined {
  if (state.phase === 'signed_out') return 'signed_out';
  if (state.phase !== 'ready' || !state.account) return 'unavailable';
  if (state.account.account.status !== 'active') return 'not_entitled';
  const model = state.models.find((entry) => entry.id === modelId);
  const features = use === 'agent' ? ['agent'] : ['chat', 'translate'];
  if (!model || !features.every((feature) => model.available_features.includes(feature)))
    return 'not_entitled';
  const entitled = state.account.entitlements.some(
    (entry) =>
      entry.status === 'active' &&
      entry.model_ids.includes(modelId) &&
      (!entry.starts_at || Date.parse(entry.starts_at) <= now) &&
      (!entry.expires_at || Date.parse(entry.expires_at) > now),
  );
  if (!entitled) return 'not_entitled';
  const pools = state.account.quota_pools.filter((pool) => pool.model_ids.includes(modelId));
  if (
    !pools.some(
      (pool) =>
        pool.windows.length > 0 &&
        pool.windows.every(
          (window) =>
            window.remaining_units > 0 &&
            (!window.period_end || Date.parse(window.period_end) > now),
        ),
    )
  )
    return 'quota_exhausted';
  return undefined;
}

export class CloudAccessError extends Error {
  readonly retryable = false;
  readonly code: string;
  constructor(readonly reason: CloudUnavailableReason) {
    super(`Cloud model cloud_${reason}`);
    this.code = `cloud_${reason}`;
    this.name = 'CloudAccessError';
  }
}
