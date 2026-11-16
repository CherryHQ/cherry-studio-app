import { ENDPOINT_TYPE, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import { CLOUD_PROVIDER_ID, type CloudState } from '@/shared/contracts/cloud';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { getOnboardingModels, getOnboardingSubscriptionModels } from '../onboardingModels';

function model(id: string, providerId = 'one', overrides: Partial<Model> = {}): Model {
  return {
    id: createUniqueModelId(providerId, id),
    modelId: id,
    name: id,
    providerId,
    capabilities: [],
    ...overrides,
  } as Model;
}

const providers = [
  { id: 'one', isEnabled: false },
  { id: 'two', isEnabled: true },
] as Provider[];

test('allows configuring a disabled provider without mixing in other providers or non-chat models', () => {
  const chat = model('chat');
  const image = model('image', 'one', {
    capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
    endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION],
  });
  expect(
    getOnboardingModels({
      local: [model('other', 'two')],
      remote: [chat, image],
      providerId: 'one',
      providers,
    }),
  ).toEqual([chat]);
});

test('keeps saved metadata for duplicate models and excludes disabled providers from the general picker', () => {
  const saved = model('chat', 'two', { name: 'My model' });
  expect(
    getOnboardingModels({
      local: [saved, model('disabled')],
      remote: [model('chat', 'two')],
      providers,
    }),
  ).toEqual([saved]);
});

const accountModel = model('entitled', CLOUD_PROVIDER_ID, {
  isEnabled: true,
  isHidden: false,
});
const cloud: CloudState = {
  phase: 'ready',
  isRefreshing: false,
  account: {
    measured_at: '2026-11-13T00:00:00Z',
    account: { id: 'account-1', status: 'active' },
    device: { id: 'device-1' },
    entitlements: [{ plan_id: 'paid', is_free: false, status: 'active', model_ids: ['entitled'] }],
    quota_pools: [],
  },
  models: [
    {
      id: 'entitled',
      display_name: 'Entitled model',
      endpoint_type: 'anthropic-messages',
      context_window: 200000,
      max_output_tokens: 4096,
      capabilities: [],
      available_features: ['agent'],
    },
  ],
  plans: null,
  webUrl: null,
};

test('uses current account entitlements rather than stale saved subscription rows', () => {
  expect(
    getOnboardingSubscriptionModels(cloud, [
      accountModel,
      model('revoked', CLOUD_PROVIDER_ID, { isEnabled: true }),
      model('local', 'one', { isEnabled: true }),
    ]),
  ).toEqual([accountModel]);
  expect(
    getOnboardingSubscriptionModels(
      { ...cloud, account: { ...cloud.account!, entitlements: [] } },
      [accountModel],
    ),
  ).toEqual([]);
});

test.each(['loading', 'error', 'signed_out'] as const)(
  'does not offer old subscription models while the account is %s',
  (phase) => {
    expect(getOnboardingSubscriptionModels({ ...cloud, phase }, [accountModel])).toEqual([]);
  },
);

test('waits for refreshed entitlements and excludes inactive or non-chat models', () => {
  expect(getOnboardingSubscriptionModels({ ...cloud, isRefreshing: true }, [accountModel])).toEqual(
    [],
  );
  expect(
    getOnboardingSubscriptionModels(cloud, [
      { ...accountModel, isEnabled: false },
      { ...accountModel, isHidden: true },
      { ...accountModel, endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION] },
    ]),
  ).toEqual([]);
});

test('allows choosing an entitled default when its temporary quota is exhausted', () => {
  expect(getOnboardingSubscriptionModels(cloud, [accountModel])).toEqual([accountModel]);
});
