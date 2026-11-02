import type { CloudState } from '@/shared/contracts/cloud';

export function cloudSnapshot(accountId = 'account-a'): CloudState {
  return {
    phase: 'ready',
    isRefreshing: false,
    account: {
      measured_at: '2026-10-31T00:00:00Z',
      account: { id: accountId, status: 'active' },
      device: { id: 'device-id' },
      entitlements: [
        {
          plan_id: 'plan',
          is_free: false,
          status: 'active',
          model_ids: ['cloud-model'],
          expires_at: '2099-01-01T00:00:00Z',
        },
      ],
      quota_pools: [
        {
          allocation_id: 'pool',
          display_name: 'Shared quota',
          measurement_kind: 'money',
          currency: 'USD',
          model_ids: ['cloud-model'],
          windows: [
            {
              window_type: 'subscription_month',
              duration_seconds: 2592000,
              limit_units: 10_000_000,
              used_units: 2_000_000,
              active_reserved_units: 1_000_000,
              remaining_units: 7_000_000,
              period_start: '2026-10-01T00:00:00Z',
              period_end: '2099-01-01T00:00:00Z',
            },
          ],
        },
      ],
    },
    plans: { measured_at: '2026-10-31T00:00:00Z', entitlements: [] },
    models: [
      {
        id: 'cloud-model',
        display_name: 'Cloud model',
        endpoint_type: 'anthropic-messages',
        context_window: 128000,
        max_output_tokens: 8192,
        capabilities: ['function-call'],
        available_features: ['agent', 'chat', 'translate'],
      },
    ],
  };
}
