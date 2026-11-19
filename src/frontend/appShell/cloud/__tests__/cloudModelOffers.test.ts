import type { CloudModel, CloudState } from '@/shared/contracts/cloud';

import { getCloudModelOffers } from '../cloudModelOffers';

const model: CloudModel = {
  id: 'paid',
  display_name: 'Paid',
  endpoint_type: 'anthropic-messages',
  context_window: 8000,
  max_output_tokens: 512,
  capabilities: [],
  available_features: ['agent'],
  requires_login: true,
};
const open = { ...model, id: 'guest', requires_login: false };
const member = { ...model, id: 'member', standalone: true };
const amd: CloudModel = {
  ...model,
  id: 'amd/one',
  provider: 'amd',
  endpoint_type: 'openai-chat-completions',
  available_features: ['chat', 'translate'],
  activation_required: true,
};
const guest: CloudState = {
  phase: 'signed_out',
  account: null,
  plans: null,
  models: [model, open, member, amd],
  isRefreshing: false,
  guestCatalog: 'ready',
};
const user: CloudState = {
  ...guest,
  phase: 'ready',
  guestCatalog: undefined,
  account: {
    measured_at: '2026-11-19T00:00:00Z',
    account: { id: 'me', status: 'active' },
    device: { id: 'phone' },
    entitlements: [],
    quota_pools: [],
  },
  plans: {
    measured_at: '2026-11-19T00:00:00Z',
    entitlements: [],
    available_plans: [
      { id: 'plus', display_name: 'Plus', is_free: false, models: [{ id: model.id }] },
    ],
  },
};

test('all published rows remain visible before and after sign-in', () => {
  for (const state of [guest, user]) {
    expect([...getCloudModelOffers(state, 'agent').keys()]).toEqual([
      'paid',
      'guest',
      'member',
      'amd/one',
    ]);
  }
  const offers = getCloudModelOffers(guest, 'agent');
  expect(offers.get(open.id)?.reason).toBeUndefined();
  for (const locked of [model, member, amd])
    expect(offers.get(locked.id)?.reason).toBe('signed_out');
});

test('login, personal subscription and AMD activation are separate admission decisions', () => {
  const offers = getCloudModelOffers(user, 'agent');
  expect(offers.get(model.id)).toMatchObject({ reason: 'subscription_required', plans: ['Plus'] });
  expect(offers.get(member.id)?.reason).toBeUndefined();
  expect(offers.get(amd.id)).toMatchObject({ isAmd: true, reason: 'amd_activation_required' });
  const activated = getCloudModelOffers(
    { ...user, models: [{ ...amd, activation_required: false }] },
    'agent',
  );
  expect(activated.get(amd.id)?.reason).toBeUndefined();
  expect(getCloudModelOffers({ ...user, phase: 'error' }).get(model.id)?.reason).toBe(
    'unavailable',
  );
});
