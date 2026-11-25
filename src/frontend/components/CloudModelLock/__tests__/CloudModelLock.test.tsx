import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CloudModelOffer } from '@/frontend/appShell/cloud';
import type { CloudAmdStatus, CloudModel } from '@/shared/contracts/cloud';

import { CloudModelLock, getCloudModelLockLabelKey } from '../CloudModelLock';

jest.mock('@cherrystudio/app-icons/icons/lock', () => {
  const { createElement } = jest.requireActual('react');
  return function MockLockIcon(props: Record<string, unknown>) {
    return createElement('LockIcon', { ...props, testID: 'cloud-model-lock-glyph' });
  };
});

const baseModel: CloudModel = {
  id: 'amd/gpt-oss',
  display_name: 'GPT-OSS',
  endpoint_type: 'openai-chat-completions',
  context_window: 8000,
  max_output_tokens: 512,
  capabilities: [],
  available_features: ['chat', 'translate'],
  requires_login: true,
  requires_plan: false,
  is_free: true,
  standalone: false,
  provider: 'amd',
  activation_required: true,
  activation_endpoint: '/api/v1/amd/desktop/entry',
};

function makeOffer(
  overrides: Partial<Omit<CloudModelOffer, 'model'>> & { model?: Partial<CloudModel> } = {},
): CloudModelOffer {
  const { model: modelOverrides, ...offerOverrides } = overrides;
  return {
    model: { ...baseModel, ...modelOverrides },
    isAmd: true,
    canViewUsage: false,
    reason: 'activation_required',
    ...offerOverrides,
  };
}

function makeAmdStatus(
  action: CloudAmdStatus['action'],
  status: CloudAmdStatus['status'] = 'unregistered',
): CloudAmdStatus {
  return {
    status,
    action,
    activated: false,
    registration_enabled: action === 'register',
    environment: 'production',
  };
}

describe('getCloudModelLockLabelKey', () => {
  it.each([
    [
      'signed-out regular model',
      makeOffer({
        isAmd: false,
        model: { provider: null, activation_required: false },
        reason: 'signed_out',
      }),
      'account.login.signIn',
    ],
    [
      'signed-out AMD model without activation required',
      makeOffer({ isAmd: true, model: { activation_required: false }, reason: 'signed_out' }),
      'account.login.signIn',
    ],
    [
      'signed-out AMD model needing activation',
      makeOffer({ isAmd: true, model: { activation_required: true }, reason: 'signed_out' }),
      'cloud.amd.tag',
    ],
    [
      'reauth-required regular model',
      makeOffer({ isAmd: false, reason: 'reauth_required' }),
      'account.login.signIn',
    ],
    [
      'reauth-required AMD model',
      makeOffer({ isAmd: true, reason: 'reauth_required' }),
      'account.login.signIn',
    ],
    [
      'subscription-required model',
      makeOffer({ isAmd: false, reason: 'subscription_required' }),
      'cloud.subscription',
    ],
    [
      'non-AMD activation-required model',
      makeOffer({ isAmd: false, model: { provider: 'partner' }, reason: 'activation_required' }),
      undefined,
    ],
    [
      'AMD model before status loads',
      makeOffer({ amdStatus: undefined, reason: 'activation_required' }),
      'cloud.amd.tag',
    ],
    [
      'AMD model with action=none',
      makeOffer({ amdStatus: makeAmdStatus('none'), reason: 'activation_required' }),
      'cloud.amd.tag',
    ],
    [
      'AMD model with action=register',
      makeOffer({ amdStatus: makeAmdStatus('register'), reason: 'activation_required' }),
      'cloud.amd.action.register',
    ],
    [
      'AMD model with action=login (existing account)',
      makeOffer({
        amdStatus: makeAmdStatus('login', 'existing_account'),
        reason: 'activation_required',
      }),
      'cloud.amd.action.link',
    ],
    [
      'AMD model with action=login (credential invalid)',
      makeOffer({
        amdStatus: makeAmdStatus('login', 'credential_invalid'),
        reason: 'activation_required',
      }),
      'cloud.amd.action.reverify',
    ],
    [
      'AMD model with action=continue',
      makeOffer({ amdStatus: makeAmdStatus('continue', 'pending'), reason: 'activation_required' }),
      'cloud.amd.continue',
    ],
    [
      'AMD model with action=wait',
      makeOffer({ amdStatus: makeAmdStatus('wait', 'pending'), reason: 'activation_required' }),
      'cloud.amd.action.wait',
    ],
    [
      'AMD model with action=contact_support',
      makeOffer({
        amdStatus: makeAmdStatus('contact_support', 'needs_review'),
        reason: 'activation_required',
      }),
      'cloud.amd.action.contactSupport',
    ],
    ['unavailable model', makeOffer({ reason: 'unavailable' }), undefined],
    ['not-entitled model', makeOffer({ reason: 'not_entitled' }), undefined],
    ['unlocked model', makeOffer({ reason: undefined }), undefined],
  ] as const)('resolves lock label for %s', (_label, offer, expected) => {
    expect(getCloudModelLockLabelKey(offer)).toBe(expected);
  });
});

describe('CloudModelLock', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('renders an amber pill tag when a label is provided', () => {
    act(() => {
      renderer = create(<CloudModelLock label="AMD 授权" />);
    });

    const tag = renderer!.root.findByProps({ testID: 'cloud-model-lock-tag' });
    expect(tag.props.className).toContain('bg-tag-amber');
    expect(tag.props.className).toContain('rounded-xl');
    expect(tag.props.accessibilityElementsHidden).toBe(true);
    expect(tag.props.importantForAccessibility).toBe('no-hide-descendants');

    const icon = tag.findByProps({ testID: 'cloud-model-lock-glyph' });
    expect(icon.props.className).toContain('text-tag-amber-foreground');

    const text = tag.findByType(Text);
    expect(text.props.children).toBe('AMD 授权');
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.className).toContain('text-tag-amber-foreground');
  });

  it('renders only a muted lock icon when no label is provided', () => {
    act(() => {
      renderer = create(<CloudModelLock />);
    });

    expect(renderer!.root.findAllByProps({ testID: 'cloud-model-lock-tag' })).toHaveLength(0);
    const iconWrapper = renderer!.root.findByProps({ testID: 'cloud-model-lock-icon' });
    expect(iconWrapper.props.accessibilityElementsHidden).toBe(true);
    expect(iconWrapper.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(iconWrapper.findByProps({ testID: 'cloud-model-lock-glyph' }).props.className).toContain(
      'text-muted-foreground',
    );
    expect(iconWrapper.findAllByType(Text)).toHaveLength(0);
  });
});
