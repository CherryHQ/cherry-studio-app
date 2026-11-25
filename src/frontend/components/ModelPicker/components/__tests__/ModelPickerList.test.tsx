import { type ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { CLOUD_PROVIDER_ID, CLOUD_PROVIDER_NAME } from '@/shared/contracts/cloud';
import { createUniqueModelId } from '@/shared/data/types/model';

import type { ModelPickerListItem } from '../../utils/modelPickerListItems';
import { ModelPickerList } from '../ModelPickerList';

jest.mock('@cherrystudio/ui/components', () => {
  const { Pressable: MockPressable, Text: MockText } = jest.requireActual('react-native');
  return {
    Button: ({ children, onPress }: { children: ReactNode; onPress: () => void }) => (
      <MockPressable onPress={onPress} testID="empty-action">
        <MockText>{children}</MockText>
      </MockPressable>
    ),
    ContentState: {
      Empty: ({ description, title }: { description?: string; title?: string }) => (
        <MockText>{title ?? description}</MockText>
      ),
    },
  };
});

jest.mock('@cherrystudio/ui/utils', () => ({ cn: (...names: unknown[]) => names.join(' ') }));
jest.mock('expo-blur', () => ({ BlurTargetView: jest.requireActual('react-native').View }));
jest.mock('@/frontend/components/Avatar', () => ({ ModelAvatar: () => null }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
let mockLegendListProps: { contentContainerStyle?: { paddingBottom?: number } } | undefined;

jest.mock('@legendapp/list/react-native', () => ({
  LegendList: ({
    contentContainerStyle,
    data,
    extraData,
    renderItem,
  }: {
    contentContainerStyle?: { paddingBottom?: number };
    data: readonly { key: string }[];
    extraData: unknown;
    renderItem: (input: { item: { key: string }; extraData: unknown }) => ReactNode;
  }) => {
    mockLegendListProps = { contentContainerStyle };
    const { View: MockView } = jest.requireActual('react-native');
    return data.map((item) => (
      <MockView key={item.key}>{renderItem({ item, extraData })}</MockView>
    ));
  },
}));

jest.mock('../ModelPickerFastScroller', () => ({ ModelPickerFastScroller: () => null }));

describe('ModelPickerList', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    mockLegendListProps = undefined;
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('adds bottomInset to the scroll content container padding', () => {
    const provider = { id: 'provider', name: 'Provider' };
    const modelId = createUniqueModelId(provider.id, 'model');
    const listItems: ModelPickerListItem[] = [
      {
        isFirstGroup: true,
        key: provider.id,
        provider,
        title: provider.name,
        type: 'groupHeader',
      },
      {
        item: {
          isCloudFree: false,
          key: modelId,
          model: {
            capabilities: [],
            id: modelId,
            modelId: 'model',
            name: 'Model',
            providerId: provider.id,
          },
          modelId,
          provider,
        } as never,
        key: modelId,
        type: 'model',
      },
    ];

    act(() => {
      renderer = create(
        <ModelPickerList
          bottomInset={34}
          listItems={listItems}
          onSelect={jest.fn()}
          selectedModelId={null}
        />,
      );
    });
    expect(mockLegendListProps?.contentContainerStyle?.paddingBottom).toBe(58);
  });

  test('offers provider setup only after loading finishes', () => {
    const onPress = jest.fn();
    const element = (isLoading: boolean) => (
      <ModelPickerList
        emptyAction={{ label: 'Add provider', onPress }}
        emptyText="No models"
        isLoading={isLoading}
        listItems={[]}
        loadingText="Loading"
        onSelect={jest.fn()}
        selectedModelId={null}
      />
    );

    act(() => {
      renderer = create(element(true));
    });
    expect(renderer?.root.findAllByProps({ testID: 'empty-action' })).toHaveLength(0);

    act(() => renderer?.update(element(false)));
    act(() => renderer?.root.findByProps({ testID: 'empty-action' }).props.onPress());

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['signed_out non-AMD', { reason: 'signed_out', isAmd: false }, 'account.login.signIn'],
    ['signed_out AMD', { reason: 'signed_out', isAmd: true }, 'cloud.amd.tag'],
    [
      'activation_required without status',
      { reason: 'activation_required', isAmd: true },
      'cloud.amd.tag',
    ],
    [
      'activation_required with register action',
      {
        reason: 'activation_required',
        isAmd: true,
        amdStatus: {
          status: 'unregistered' as const,
          action: 'register' as const,
          activated: false,
          registration_enabled: true,
          environment: 'production' as const,
        },
      },
      'cloud.amd.action.register',
    ],
    [
      'subscription_required',
      { reason: 'subscription_required', isAmd: false },
      'cloud.subscription',
    ],
  ] as const)(
    'a free model with %s shows the free badge and handles access on tap',
    (_label, config, lockLabel) => {
      const provider = { id: CLOUD_PROVIDER_ID, name: CLOUD_PROVIDER_NAME };
      const { amdStatus, isAmd, reason } = config as {
        reason: 'signed_out' | 'activation_required' | 'subscription_required';
        isAmd: boolean;
        amdStatus?: {
          status: 'unregistered';
          action: 'register';
          activated: boolean;
          registration_enabled: boolean;
          environment: 'production';
        };
      };
      const modelId = isAmd ? 'amd/gpt-oss' : 'gpt-oss';
      const id = createUniqueModelId(provider.id, modelId);
      const onCloudOffer = jest.fn();
      const onSelect = jest.fn();

      act(() => {
        renderer = create(
          <ModelPickerList
            listItems={[
              {
                isFirstGroup: true,
                key: provider.id,
                provider,
                title: provider.name,
                type: 'groupHeader',
              },
              {
                item: {
                  isCloudFree: true,
                  key: id,
                  model: {
                    capabilities: [],
                    id,
                    modelId,
                    name: 'GPT-OSS',
                    providerId: provider.id,
                  },
                  modelId: id,
                  provider,
                  offer: {
                    isAmd,
                    amdStatus,
                    reason,
                    canViewUsage: false,
                    model: {
                      id: modelId,
                      display_name: 'GPT-OSS',
                      endpoint_type: 'openai-chat-completions',
                      requires_login: true,
                      requires_plan: !isAmd,
                      standalone: false,
                      is_free: true,
                      provider: isAmd ? 'amd' : null,
                      activation_endpoint: isAmd ? '/api/v1/amd/desktop/entry' : null,
                      activation_required: isAmd,
                      context_window: 4096,
                      max_output_tokens: 512,
                      capabilities: [],
                      available_features: ['agent'],
                    },
                  },
                },
                key: id,
                type: 'model',
              },
            ]}
            onCloudOffer={onCloudOffer}
            onSelect={onSelect}
            selectedModelId={null}
            showBadges
          />,
        );
      });

      const row = renderer?.root.findByProps({ accessibilityRole: 'button' });
      expect(row?.findAllByType(Text).map((text) => text.props.children)).toEqual([
        'GPT-OSS',
        'models.badge.free',
        lockLabel,
      ]);
      expect(row?.props.accessibilityLabel).toBe(`GPT-OSS, models.capability.free, ${lockLabel}`);
      expect(row?.props.disabled).toBe(false);
      act(() => row?.props.onPress());
      expect(onCloudOffer).toHaveBeenCalledWith(modelId);
      expect(onSelect).not.toHaveBeenCalled();
    },
  );
});
