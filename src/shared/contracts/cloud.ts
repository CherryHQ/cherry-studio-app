import * as z from 'zod';

export const CLOUD_PROVIDER_ID = 'cherryai-subscription';
export const CLOUD_PROVIDER_NAME = 'CherryAI';
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
  available_plans: z.array(PlanSchema),
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
  provider: z.string().optional(),
  activation_required: z.boolean().optional(),
});
export const CloudAmdStatusSchema = z.object({
  status: z.enum([
    'unregistered',
    'pending',
    'needs_review',
    'registered',
    'existing_account',
    'inactive',
    'credential_invalid',
  ]),
  action: z.enum(['register', 'login', 'wait', 'continue', 'contact_support', 'none']),
  activated: z.boolean(),
  registration_enabled: z.boolean().default(false),
  environment: z.enum(['simulator', 'test', 'production']),
});
export type CloudAmdStatus = z.infer<typeof CloudAmdStatusSchema>;
export type CloudAmdState =
  | Readonly<{ phase: 'loading' | 'error' }>
  | Readonly<{ phase: 'ready'; status: CloudAmdStatus }>;
export type CloudModel = z.infer<typeof CloudModelSchema>;
export type CloudAccount = z.infer<typeof CloudAccountSchema>;
export type CloudPlans = z.infer<typeof CloudPlansSchema>;
export type CloudQuotaWindow = z.infer<typeof CloudQuotaWindowSchema>;
export type CloudUnavailableReason =
  | 'signed_out'
  | 'unavailable'
  | 'not_entitled'
  | 'quota_exhausted'
  | 'amd_activation_required';
export type CloudState = Readonly<{
  phase: 'signed_out' | 'loading' | 'ready' | 'error';
  isRefreshing: boolean;
  account: CloudAccount | null;
  /** Optional badge metadata; never controls model admission. */
  plans: CloudPlans | null;
  models: readonly CloudModel[];
  /** Status for the AMD setup flow. The signed model catalog owns availability. */
  amd?: CloudAmdState;
}>;
export interface CloudModule {
  getState(): CloudState;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  refreshProvider(): Promise<void>;
  refreshAmd(): Promise<void>;
  createAmdEntry(): Promise<string>;
}

export function isCloudAmdModel(model: CloudModel): boolean {
  return (
    model.provider === 'amd' &&
    model.id.startsWith('amd/') &&
    model.id.length > 'amd/'.length &&
    model.endpoint_type === 'openai-chat-completions'
  );
}

function isEffectiveEntitlement(entry: CloudAccount['entitlements'][number], now: number): boolean {
  return (
    entry.status === 'active' &&
    (!entry.starts_at || Date.parse(entry.starts_at) <= now) &&
    (!entry.expires_at || Date.parse(entry.expires_at) > now)
  );
}

export function isCloudFreeModel(state: CloudState, model: CloudModel, now = Date.now()): boolean {
  return (
    isCloudAmdModel(model) ||
    (state.account?.entitlements.some(
      (entry) =>
        entry.is_free && isEffectiveEntitlement(entry, now) && entry.model_ids.includes(model.id),
    ) ??
      false)
  );
}

/** Quota exhaustion keeps a model visible; the selected use still determines its capabilities. */
export function isCloudModelListed(
  state: CloudState,
  modelId: string,
  uses: readonly CloudModelUse[] = ['agent', 'general'],
): boolean {
  return uses.some((use) => {
    const reason = cloudModelUnavailable(state, modelId, use);
    return reason === undefined || reason === 'quota_exhausted';
  });
}

/** A current paid subscription, independent of remaining quota or catalog availability. */
export function hasActiveCloudSubscription(state: CloudState, now = Date.now()): boolean {
  return (
    state.phase === 'ready' &&
    state.account?.account.status === 'active' &&
    state.account.entitlements.some((entry) => !entry.is_free && isEffectiveEntitlement(entry, now))
  );
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
  if (model.provider === 'amd') {
    if (!isCloudAmdModel(model)) return 'not_entitled';
    return model.activation_required === false ? undefined : 'amd_activation_required';
  }
  const entitled = state.account.entitlements.some(
    (entry) => isEffectiveEntitlement(entry, now) && entry.model_ids.includes(modelId),
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
