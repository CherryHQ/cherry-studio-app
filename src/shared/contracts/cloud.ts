import * as z from 'zod';

import {
  DEFAULT_MODEL_CONTEXT_WINDOW,
  DEFAULT_MODEL_MAX_OUTPUT_TOKENS,
} from '@/shared/utils/modelTokenLimits';

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
  models: z.array(z.object({ id: z.string().min(1) })).optional(),
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

const ModelStringListSchema = z
  .array(z.unknown())
  .catch([])
  .transform((values) => values.filter((value) => typeof value === 'string'));

export const CloudModelSchema = z
  .object({
    id: z.string().regex(/\S/),
    endpoint_type: z.enum(['anthropic-messages', 'openai-chat-completions']),
    display_name: z.string().trim().catch(''),
    context_window: z.number().int().positive().catch(DEFAULT_MODEL_CONTEXT_WINDOW),
    max_output_tokens: z.number().int().positive().catch(DEFAULT_MODEL_MAX_OUTPUT_TOKENS),
    capabilities: ModelStringListSchema,
    available_features: ModelStringListSchema,
    requires_login: z.boolean().catch(true),
    requires_plan: z.boolean().catch(true),
    is_free: z.boolean().catch(false),
    standalone: z.boolean().catch(false),
    provider: z.string().trim().min(1).nullable().catch(null),
    activation_required: z.boolean().nullable().catch(null),
    activation_endpoint: z.string().trim().min(1).nullable().catch(null),
  })
  .transform((model) => ({
    ...model,
    display_name: model.display_name || model.id,
    // Plan coverage can admit a regular subscription model. Other offers need explicit activation status.
    activation_required:
      model.activation_required ??
      (!model.requires_plan || model.provider !== null || model.activation_endpoint !== null),
  }));

export const CloudModelCatalogSchema = z.object({
  data: z.array(z.unknown()).transform((rows) =>
    rows.flatMap((row) => {
      const model = CloudModelSchema.safeParse(row);
      return model.success ? [model.data] : [];
    }),
  ),
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
  | Readonly<{ phase: 'loading' | 'error' | 'unsupported' }>
  | Readonly<{ phase: 'ready'; status: CloudAmdStatus }>;
export type CloudModel = z.infer<typeof CloudModelSchema>;
export type CloudAccount = z.infer<typeof CloudAccountSchema>;
export type CloudPlans = z.infer<typeof CloudPlansSchema>;
export type CloudQuotaWindow = z.infer<typeof CloudQuotaWindowSchema>;
export type CloudUnavailableReason =
  | 'signed_out'
  | 'unavailable'
  | 'not_entitled'
  | 'subscription_required'
  | 'activation_required'
  | 'reauth_required'
  | 'account_disabled';
export type CloudState = Readonly<{
  phase: 'signed_out' | 'loading' | 'ready' | 'error';
  isRefreshing: boolean;
  account: CloudAccount | null;
  /** Named plan coverage and badge metadata. Inference uses the account and model directory. */
  plans: CloudPlans | null;
  accountIssue?: 'reauth_required' | 'account_disabled';
  models: readonly CloudModel[];
  /** Status for the AMD setup flow. The signed model catalog owns availability. */
  amd?: CloudAmdState;
  guestCatalog?: 'loading' | 'ready' | 'error';
}>;
type CloudRefreshMode = 'manual' | 'background' | 'if-stale';
export interface CloudModule {
  getState(): CloudState;
  subscribe(listener: () => void): () => void;
  refresh(mode?: CloudRefreshMode): Promise<void>;
  refreshProvider(): Promise<void>;
  refreshAmd(): Promise<void>;
  createActivationEntry(modelId: string): Promise<string>;
}

export function isCloudAmdModel(model: CloudModel): boolean {
  return model.provider === 'amd' && model.endpoint_type === 'openai-chat-completions';
}

function isEffectiveEntitlement(entry: CloudAccount['entitlements'][number], now: number): boolean {
  return (
    entry.status === 'active' &&
    (!entry.starts_at || Date.parse(entry.starts_at) <= now) &&
    (!entry.expires_at || Date.parse(entry.expires_at) > now)
  );
}

export function supportsCloudModelUse(model: CloudModel, use: CloudModelUse): boolean {
  const features = model.available_features;
  return use === 'agent'
    ? features.includes('agent') ||
        ((isCloudAmdModel(model) || model.standalone) && features.includes('chat'))
    : features.includes('chat') && features.includes('translate');
}

/** Model visibility follows the entitlement and the features required for the selected use. */
export function isCloudModelListed(
  state: CloudState,
  modelId: string,
  uses: readonly CloudModelUse[] = ['agent', 'general'],
): boolean {
  return uses.some((use) => cloudModelUnavailable(state, modelId, use) === undefined);
}

/** The last confirmed paid entitlements can still be displayed if a refresh fails. */
export function getActiveCloudEntitlements(
  state: CloudState,
  now = Date.now(),
): CloudAccount['entitlements'] {
  if (
    (state.phase !== 'ready' && state.phase !== 'error') ||
    state.account?.account.status !== 'active'
  )
    return [];
  return state.account.entitlements.filter(
    (entry) => !entry.is_free && isEffectiveEntitlement(entry, now),
  );
}

/** Model access here depends on identity, entitlement and features. The gateway checks quota. */
export function cloudModelUnavailable(
  state: CloudState,
  modelId: string,
  use: CloudModelUse,
  now = Date.now(),
): CloudUnavailableReason | undefined {
  const model = state.models.find((entry) => entry.id === modelId);
  if (!model) return 'unavailable';
  if (state.phase === 'signed_out') {
    if (model.requires_login) return 'signed_out';
    if (state.guestCatalog !== 'ready') return 'unavailable';
  } else {
    if (state.accountIssue) return state.accountIssue;
    if (state.phase !== 'ready' || !state.account) return 'unavailable';
    if (state.account.account.status === 'disabled') return 'account_disabled';
  }
  if (
    model.requires_plan &&
    !state.account?.entitlements.some(
      (entry) => isEffectiveEntitlement(entry, now) && entry.model_ids.includes(model.id),
    )
  )
    return 'subscription_required';
  if (model.activation_required) {
    if (
      !model.activation_endpoint ||
      (isCloudAmdModel(model) && state.amd?.phase === 'unsupported')
    )
      return 'unavailable';
    return 'activation_required';
  }
  return supportsCloudModelUse(model, use) ? undefined : 'not_entitled';
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
