import {
  CloudAccountSchema,
  CloudPlansSchema,
  cloudModelUnavailable,
  getActiveCloudEntitlements,
  CloudModelCatalogSchema,
} from '@/shared/contracts/cloud';

import { cloudSnapshot } from './_cloudFixtures';

const now = Date.parse('2026-10-31T00:00:00Z');

test('effective free and paid plans grant access to the models in their rules', () => {
  const state = cloudSnapshot();
  const entitlement = state.account!.entitlements[0];
  entitlement.is_free = true;
  expect(cloudModelUnavailable(state, 'cloud-model', 'agent', now)).toBeUndefined();
  expect(getActiveCloudEntitlements(state, now)).toEqual([]);
  entitlement.model_ids = ['another-model'];
  expect(cloudModelUnavailable(state, 'cloud-model', 'agent', now)).toBe('subscription_required');
  const paid = { ...entitlement, is_free: false, model_ids: ['another-model'] };
  state.account!.entitlements.push(paid);
  expect(cloudModelUnavailable(state, 'cloud-model', 'agent', now)).toBe('subscription_required');
  paid.model_ids.push('cloud-model');
  expect(cloudModelUnavailable(state, 'cloud-model', 'agent', now)).toBeUndefined();
});

test('general generation requires both chat and translate, independently of Agent use', () => {
  const state = cloudSnapshot();
  state.models[0].available_features = ['agent', 'chat'];
  expect(cloudModelUnavailable(state, 'cloud-model', 'agent', now)).toBeUndefined();
  expect(cloudModelUnavailable(state, 'cloud-model', 'general', now)).toBe('not_entitled');
});

test('expired and not-yet-active entitlements cannot grant a model', () => {
  const state = cloudSnapshot();
  state.account!.entitlements[0].expires_at = '2026-10-30T00:00:00Z';
  expect(cloudModelUnavailable(state, 'cloud-model', 'agent', now)).toBe('subscription_required');
  state.account!.entitlements[0].expires_at = '2099-01-01T00:00:00Z';
  state.account!.entitlements[0].starts_at = '2026-11-01T00:00:00Z';
  expect(cloudModelUnavailable(state, 'cloud-model', 'agent', now)).toBe('subscription_required');
});

test('stale or signed-out state never grants access even if it carries previous data', () => {
  const state = cloudSnapshot();
  expect(cloudModelUnavailable({ ...state, phase: 'error' }, 'cloud-model', 'agent', now)).toBe(
    'unavailable',
  );
  expect(
    cloudModelUnavailable({ ...state, phase: 'signed_out' }, 'cloud-model', 'agent', now),
  ).toBe('signed_out');
});

test('missing quota data does not hide an entitled model', () => {
  const state = cloudSnapshot();
  state.account!.quota_pools = [];
  expect(cloudModelUnavailable(state, 'cloud-model', 'agent', now)).toBeUndefined();
});

test('the wire contract retains reserved money units and subscription-month dates', () => {
  const state = cloudSnapshot();
  expect(CloudAccountSchema.parse(state.account).quota_pools[0].windows[0]).toMatchObject({
    remaining_units: 7_000_000,
    active_reserved_units: 1_000_000,
    window_type: 'subscription_month',
    period_end: '2099-01-01T00:00:00Z',
  });
  expect(CloudPlansSchema.parse(state.plans).entitlements).toEqual([]);
  delete state.account!.quota_pools[0].currency;
  expect(CloudAccountSchema.safeParse(state.account).success).toBe(false);
});

test('the plans contract keeps available paid plans when there is no current subscription', () => {
  const plan = {
    id: 'available-paid-plan',
    display_name: 'Paid plan',
    is_free: false,
    subscription_price: {
      product_name: 'Monthly plan',
      currency: 'USD',
      interval: 'month',
      unit_amount: 1000,
    },
  };
  const plans = CloudPlansSchema.parse({
    measured_at: '2026-10-31T00:00:00Z',
    available_plans: [plan],
    entitlements: [],
  });
  expect(plans.available_plans).toEqual([plan]);
});

test('parses all 14 fields and defaults legacy 7-field rows conservatively', () => {
  const base = cloudSnapshot().models[0];
  const data = [
    base,
    { ...base, id: 'free-plan', is_free: true },
    {
      ...base,
      id: 'amd/chat',
      provider: 'amd',
      requires_plan: false,
      is_free: true,
      endpoint_type: 'openai-chat-completions',
      activation_required: true,
      activation_endpoint: '/api/v1/amd/desktop/entry',
    },
    { ...base, id: 'standalone', requires_plan: false, standalone: true, is_free: true },
    { ...base, id: 'standalone-with-plan', standalone: true, requires_plan: true },
    { ...base, id: 'no-plan', requires_plan: false },
  ];
  expect(CloudModelCatalogSchema.parse({ data })).toEqual({ data });
  expect(
    CloudModelCatalogSchema.safeParse({
      data: [{ ...base, provider: 'another-partner', new_field: true }],
    }).success,
  ).toBe(true);

  const legacyRow = {
    id: base.id,
    display_name: base.display_name,
    endpoint_type: base.endpoint_type,
    context_window: base.context_window,
    max_output_tokens: base.max_output_tokens,
    capabilities: base.capabilities,
    available_features: base.available_features,
  };
  expect(CloudModelCatalogSchema.parse({ data: [legacyRow] })).toEqual({
    data: [
      {
        ...legacyRow,
        requires_login: true,
        requires_plan: true,
        is_free: false,
        standalone: false,
        provider: null,
        activation_required: false,
        activation_endpoint: null,
      },
    ],
  });

  expect(
    CloudModelCatalogSchema.parse({
      data: [
        {
          id: base.id,
          display_name: base.display_name,
          endpoint_type: base.endpoint_type,
          context_window: base.context_window,
          max_output_tokens: base.max_output_tokens,
          capabilities: null,
          available_features: null,
          requires_login: null,
          requires_plan: null,
          is_free: null,
          standalone: null,
          provider: null,
          activation_required: null,
          activation_endpoint: null,
        },
        {
          id: 'omitted-capabilities',
          display_name: base.display_name,
          endpoint_type: base.endpoint_type,
          context_window: base.context_window,
          max_output_tokens: base.max_output_tokens,
          available_features: ['agent'],
        },
      ],
    }),
  ).toEqual({
    data: [
      {
        id: base.id,
        display_name: base.display_name,
        endpoint_type: base.endpoint_type,
        context_window: base.context_window,
        max_output_tokens: base.max_output_tokens,
        capabilities: [],
        available_features: [],
        requires_login: true,
        requires_plan: true,
        is_free: false,
        standalone: false,
        provider: null,
        activation_required: false,
        activation_endpoint: null,
      },
      {
        id: 'omitted-capabilities',
        display_name: base.display_name,
        endpoint_type: base.endpoint_type,
        context_window: base.context_window,
        max_output_tokens: base.max_output_tokens,
        capabilities: [],
        available_features: ['agent'],
        requires_login: true,
        requires_plan: true,
        is_free: false,
        standalone: false,
        provider: null,
        activation_required: false,
        activation_endpoint: null,
      },
    ],
  });

  for (const key of [
    'id',
    'display_name',
    'endpoint_type',
    'context_window',
    'max_output_tokens',
    'available_features',
  ] as const) {
    expect(
      CloudModelCatalogSchema.safeParse({ data: [{ ...legacyRow, [key]: undefined }] }).success,
    ).toBe(false);
  }
  for (const badOptional of [
    { requires_login: 'yes' },
    { requires_plan: 0 },
    { is_free: 'true' },
    { standalone: 1 },
    { provider: 123 },
    { activation_required: 'false' },
    { activation_endpoint: 42 },
  ]) {
    expect(
      CloudModelCatalogSchema.safeParse({ data: [{ ...legacyRow, ...badOptional }] }).success,
    ).toBe(false);
  }
});

test('catalogs without a plan flag preserve AMD activation and standalone guest access', () => {
  const member = cloudSnapshot();
  member.account!.entitlements = [];
  const row = {
    display_name: 'Chat',
    endpoint_type: 'openai-chat-completions',
    context_window: 8000,
    max_output_tokens: 512,
    capabilities: [],
    available_features: ['chat', 'translate'],
  };
  const { data: models } = CloudModelCatalogSchema.parse({
    data: [
      {
        ...row,
        id: 'amd/chat',
        provider: 'amd',
        requires_login: true,
        activation_required: true,
        activation_endpoint: '/api/v1/amd/desktop/entry',
      },
      { ...row, id: 'guest-chat', standalone: true, requires_login: false, requires_plan: null },
    ],
  });
  expect(cloudModelUnavailable({ ...member, models }, 'amd/chat', 'agent', now)).toBe(
    'activation_required',
  );
  expect(
    cloudModelUnavailable(
      {
        phase: 'signed_out',
        guestCatalog: 'ready',
        account: null,
        plans: null,
        models,
        isRefreshing: false,
      },
      'guest-chat',
      'agent',
      now,
    ),
  ).toBeUndefined();
});
