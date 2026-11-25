import type { CloudModel, CloudState } from '@/shared/contracts/cloud';

import { getCloudModelOffers, getCloudModelTapNotice } from '../cloudModelOffers';

const model: CloudModel = {
  id: 'paid',
  display_name: 'Paid',
  endpoint_type: 'anthropic-messages',
  context_window: 8000,
  max_output_tokens: 512,
  capabilities: [],
  available_features: ['agent'],
  requires_login: true,
  requires_plan: true,
  is_free: false,
  standalone: false,
  provider: null,
  activation_required: false,
  activation_endpoint: null,
};
const open = {
  ...model,
  id: 'guest',
  requires_login: false,
  requires_plan: false,
  standalone: true,
  is_free: true,
};
const member = { ...model, id: 'member', standalone: true, requires_plan: false, is_free: true };
const amd: CloudModel = {
  ...model,
  id: 'amd/one',
  provider: 'amd',
  endpoint_type: 'openai-chat-completions',
  available_features: ['chat', 'translate'],
  requires_plan: false,
  is_free: true,
  activation_required: true,
  activation_endpoint: '/api/v1/amd/desktop/entry',
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
  expect(offers.get(model.id)?.reason).toBe('subscription_required');
  expect(offers.get(member.id)?.reason).toBeUndefined();
  expect(offers.get(amd.id)).toMatchObject({ isAmd: true, reason: 'activation_required' });
  const activated = getCloudModelOffers(
    { ...user, models: [{ ...amd, activation_required: false }] },
    'agent',
  );
  expect(activated.get(amd.id)?.reason).toBeUndefined();
  expect(getCloudModelOffers({ ...user, phase: 'error' }).get(model.id)?.reason).toBe(
    'unavailable',
  );
});

test.each([true, false])('missing plan access explains the requirement (is_free=%s)', (is_free) => {
  const state = { ...user, models: [{ ...model, is_free }] };
  const offer = getCloudModelOffers(state).get(model.id);
  expect(offer?.reason).toBe('subscription_required');
  expect(getCloudModelTapNotice(offer)).toBe('cloud.planRequired');
});

test('a free plan offer always carries its free badge, even before the account receives an entitlement', () => {
  const free = { ...model, is_free: true };
  expect(getCloudModelOffers({ ...user, models: [free], plans: null }).get(free.id)).toMatchObject({
    model: { is_free: true },
    reason: 'subscription_required',
  });
  expect(getCloudModelOffers({ ...guest, models: [free] }).get(free.id)).toMatchObject({
    model: { is_free: true },
    reason: 'signed_out',
  });
});
test('activation follows the advertised endpoint and the availability of the AMD status route', () => {
  expect(
    getCloudModelOffers({ ...user, models: [{ ...amd, activation_endpoint: null }] }).get(amd.id)
      ?.reason,
  ).toBe('unavailable');
  expect(getCloudModelOffers({ ...user, amd: { phase: 'unsupported' } }).get(amd.id)?.reason).toBe(
    'unavailable',
  );
  const partner = { ...amd, id: 'other', provider: 'partner' };
  expect(getCloudModelOffers({ ...user, models: [partner] }).get(partner.id)).toMatchObject({
    isAmd: false,
    reason: 'activation_required',
  });
});

test('attaches ready AMD status only to AMD offers', () => {
  const readyStatus = {
    status: 'unregistered' as const,
    action: 'register' as const,
    activated: false,
    registration_enabled: true,
    environment: 'production' as const,
  };
  const readyOffers = getCloudModelOffers(
    { ...user, amd: { phase: 'ready', status: readyStatus } },
    'agent',
  );
  expect(readyOffers.get(amd.id)?.amdStatus).toEqual(readyStatus);
  expect(readyOffers.get(model.id)?.amdStatus).toBeUndefined();

  for (const amdState of [
    undefined,
    { phase: 'loading' as const },
    { phase: 'error' as const },
    { phase: 'unsupported' as const },
  ]) {
    const offers = getCloudModelOffers({ ...user, amd: amdState }, 'agent');
    expect(offers.get(amd.id)?.amdStatus).toBeUndefined();
  }
});
