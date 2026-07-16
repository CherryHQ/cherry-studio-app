import { type MenuAction, MenuView, type NativeActionEvent } from '@expo/ui/community/menu';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Accordion } from 'heroui-native/accordion';
import { Button } from 'heroui-native/button';
import { Input } from 'heroui-native/input';
import { useToast } from 'heroui-native/toast';
import { EyeIcon, EyeOffIcon, ImageUpIcon, RotateCcwIcon, SaveIcon } from 'lucide-uniwind/png';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, ScrollView, Text, View } from 'react-native';

import { Image } from '@/components/uniwind';
import { BackHeader, type HeaderToolbarAction } from '@/components/headers';
import { queryKeys } from '@/data/api';
import { useDataMutation } from '@/data/hooks';
import { ENDPOINT_TYPE } from '@/data/types/model';
import type { ApiKeyEntry, EndpointConfigs } from '@/data/types/provider';
import { saveProviderAvatar } from '@/services/providerAvatarStorage';
import { SettingsIconButton } from '../components/SettingsIconButton';
import { providerApiServiceStyles } from './apiService/utils/providerApiServiceStyles';

const avatarPreviewSize = 96;

type CreateProviderFormValues = {
  apiKey: string;
  avatarUri: string | null;
  endpoints: {
    anthropic: string;
    gemini: string;
    openaiResponses: string;
  };
  baseUrl: string;
  name: string;
};

export default function NewProviderScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [avatarDraftUri, setAvatarDraftUri] = useState<string | null>(null);
  const [anthropicUrl, setAnthropicUrl] = useState('');
  const [geminiUrl, setGeminiUrl] = useState('');
  const [openaiResponsesUrl, setOpenaiResponsesUrl] = useState('');

  const createProviderMutation = useDataMutation({
    invalidateQueries: [queryKeys.providers.list()],
    mutationFn: async (services, values: CreateProviderFormValues) => {
      const providerId = Crypto.randomUUID();
      const trimmedApiKey = values.apiKey.trim();

      const endpointConfigs: EndpointConfigs = {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: values.baseUrl.trim() },
      };
      if (values.endpoints.anthropic.trim()) {
        endpointConfigs[ENDPOINT_TYPE.ANTHROPIC_MESSAGES] = {
          baseUrl: values.endpoints.anthropic.trim(),
        };
      }
      if (values.endpoints.gemini.trim()) {
        endpointConfigs[ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT] = {
          baseUrl: values.endpoints.gemini.trim(),
        };
      }
      if (values.endpoints.openaiResponses.trim()) {
        endpointConfigs[ENDPOINT_TYPE.OPENAI_RESPONSES] = {
          baseUrl: values.endpoints.openaiResponses.trim(),
        };
      }

      const apiKeys: ApiKeyEntry[] | undefined = trimmedApiKey
        ? [{ id: Crypto.randomUUID(), isEnabled: true, key: trimmedApiKey }]
        : undefined;

      await services.provider.create({
        apiKeys,
        authConfig: { type: 'api-key' },
        defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
        endpointConfigs,
        name: values.name.trim(),
        providerId,
      });

      if (values.avatarUri) {
        await saveProviderAvatar(providerId, values.avatarUri);
      }

      // Providers are created disabled; the user asked for new custom providers to
      // land already enabled, so flip it on before navigating to the detail page.
      await services.provider.update(providerId, { isEnabled: true });

      return providerId;
    },
  });

  const selectAvatarFromCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ['images'],
      quality: 1,
    });

    const assetUri = result.canceled ? undefined : result.assets[0]?.uri;
    if (assetUri) {
      setAvatarDraftUri(assetUri);
    }
  }, []);

  const selectAvatarFromPhotoLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(false);
    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ['images'],
      quality: 1,
      selectionLimit: 1,
    });

    const assetUri = result.canceled ? undefined : result.assets[0]?.uri;
    if (assetUri) {
      setAvatarDraftUri(assetUri);
    }
  }, []);

  const uploadActions = useMemo<MenuAction[]>(
    () => [
      { id: 'camera', image: 'camera', title: t('chat.media.camera') },
      { id: 'photos', image: 'photo', title: t('chat.media.photos') },
    ],
    [t],
  );
  const handleUploadAction = useCallback(
    (event: NativeActionEvent) => {
      if (event.nativeEvent.event === 'camera') {
        void selectAvatarFromCamera();
        return;
      }
      void selectAvatarFromPhotoLibrary();
    },
    [selectAvatarFromCamera, selectAvatarFromPhotoLibrary],
  );
  const resetAvatar = useCallback(() => setAvatarDraftUri(null), []);

  const canSubmit = name.trim().length > 0 && baseUrl.trim().length > 0;
  const handleFinish = useCallback(() => {
    if (!canSubmit || createProviderMutation.isPending) {
      return;
    }
    Keyboard.dismiss();

    const trimmedName = name.trim();
    createProviderMutation.mutate(
      {
        apiKey,
        avatarUri: avatarDraftUri,
        baseUrl,
        endpoints: {
          anthropic: anthropicUrl,
          gemini: geminiUrl,
          openaiResponses: openaiResponsesUrl,
        },
        name,
      },
      {
        onError: () => {
          toast.show({ label: t('settings.provider.add.error'), variant: 'danger' });
        },
        onSuccess: (providerId) => {
          router.replace({
            params: { providerId, providerName: trimmedName },
            pathname: '/settings/provider/[providerId]',
          });
        },
      },
    );
  }, [
    anthropicUrl,
    apiKey,
    avatarDraftUri,
    baseUrl,
    canSubmit,
    createProviderMutation,
    geminiUrl,
    name,
    openaiResponsesUrl,
    router,
    t,
    toast,
  ]);

  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.save'),
        androidIcon: SaveIcon,
        disabled: !canSubmit || createProviderMutation.isPending,
        icon: 'checkmark',
        key: 'finish-new-provider',
        onPress: handleFinish,
      },
    ],
    [canSubmit, createProviderMutation.isPending, handleFinish, t],
  );

  return (
    <>
      <BackHeader rightActions={rightActions} title={t('settings.provider.add.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-6 px-6 py-8">
          <View className="items-center gap-4">
            <AvatarPreview name={name} size={avatarPreviewSize} uri={avatarDraftUri} />
            <View className="flex-row items-center gap-3">
              <MenuView actions={uploadActions} onPressAction={handleUploadAction}>
                <Button
                  className="h-10 min-h-10 flex-row gap-2 rounded-xl px-4"
                  variant="secondary"
                >
                  <ImageUpIcon className="size-4 text-default-foreground" strokeWidth={2} />
                  <Text className="text-base text-foreground">
                    {t('settings.provider.add.uploadImage')}
                  </Text>
                </Button>
              </MenuView>
              <Button
                className="h-10 min-h-10 flex-row gap-2 rounded-xl px-4"
                isDisabled={!avatarDraftUri}
                onPress={resetAvatar}
                variant="secondary"
              >
                <RotateCcwIcon className="size-4 text-default-foreground" strokeWidth={2} />
                <Text className="text-base text-foreground">
                  {t('settings.provider.add.resetAvatar')}
                </Text>
              </Button>
            </View>
          </View>

          <FormField label={t('settings.provider.add.name')} required>
            <Input
              autoCapitalize="none"
              autoCorrect={false}
              className="h-10 min-h-0 rounded-xl px-3 py-0 text-base leading-5"
              onChangeText={setName}
              placeholder={t('settings.provider.add.namePlaceholder')}
              style={providerApiServiceStyles.input}
              value={name}
              variant="secondary"
            />
          </FormField>

          <FormField label={t('settings.provider.apiService.baseUrl')} required>
            <Input
              autoCapitalize="none"
              autoCorrect={false}
              className="h-10 min-h-0 rounded-xl px-3 py-0 text-base leading-5"
              keyboardType="url"
              onChangeText={setBaseUrl}
              placeholder={t('settings.provider.apiService.baseUrlPlaceholder')}
              style={providerApiServiceStyles.input}
              value={baseUrl}
              variant="secondary"
            />
          </FormField>

          <FormField label={t('settings.provider.apiService.apiKey')}>
            <View className="flex-row items-center gap-2">
              <View className="h-10 min-w-0 flex-1 overflow-hidden rounded-xl">
                <Input
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="h-10 max-h-10 min-h-0 w-full rounded-xl px-3 py-0 text-base leading-5"
                  onChangeText={setApiKey}
                  placeholder={t('settings.provider.apiService.apiKeyPlaceholder')}
                  secureTextEntry={!apiKeyVisible}
                  style={providerApiServiceStyles.input}
                  value={apiKey}
                  variant="secondary"
                />
              </View>
              <SettingsIconButton
                accessibilityLabel={
                  apiKeyVisible
                    ? t('settings.provider.apiService.hideApiKeys')
                    : t('settings.provider.apiService.showApiKeys')
                }
                onPress={() => setApiKeyVisible((visible) => !visible)}
              >
                {apiKeyVisible ? (
                  <EyeIcon className="size-5 text-default-foreground" strokeWidth={2} />
                ) : (
                  <EyeOffIcon className="size-5 text-default-foreground" strokeWidth={2} />
                )}
              </SettingsIconButton>
            </View>
          </FormField>

          <Accordion
            className="overflow-hidden rounded-xl bg-settings-grouped-surface"
            hideSeparator
            isCollapsible
            selectionMode="single"
          >
            <Accordion.Item value="more-endpoints">
              <Accordion.Trigger className="min-h-11 px-3 py-3">
                <View className="flex-1">
                  <Text className="font-medium text-default-foreground text-sm">
                    {t('settings.provider.apiService.moreEndpoints')}
                  </Text>
                </View>
                <Accordion.Indicator iconProps={{ size: 18 }} />
              </Accordion.Trigger>
              <Accordion.Content className="gap-4 px-3 pb-4">
                <EndpointField
                  label={t('settings.provider.add.endpoint.anthropic')}
                  onChangeText={setAnthropicUrl}
                  value={anthropicUrl}
                />
                <EndpointField
                  label={t('settings.provider.add.endpoint.gemini')}
                  onChangeText={setGeminiUrl}
                  value={geminiUrl}
                />
                <EndpointField
                  label={t('settings.provider.add.endpoint.openaiResponses')}
                  onChangeText={setOpenaiResponsesUrl}
                  value={openaiResponsesUrl}
                />
              </Accordion.Content>
            </Accordion.Item>
          </Accordion>
        </View>
      </ScrollView>
    </>
  );
}

function AvatarPreview({ name, size, uri }: { name: string; size: number; uri: string | null }) {
  const frameStyle = { borderRadius: size / 2, height: size, width: size };

  if (uri) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        cachePolicy="memory-disk"
        contentFit="cover"
        source={{ uri }}
        style={frameStyle}
      />
    );
  }

  const initial = name.trim().charAt(0).toUpperCase() || 'P';

  return (
    <View className="items-center justify-center bg-surface-secondary" style={frameStyle}>
      <Text
        className="font-medium text-default-foreground"
        style={{ fontSize: Math.round(size * 0.42) }}
      >
        {initial}
      </Text>
    </View>
  );
}

function FormField({
  children,
  label,
  required,
}: {
  children: ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <View className="gap-2">
      <Text className="font-medium text-default-foreground text-sm">
        {label}
        {required ? <Text className="text-danger"> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

function EndpointField({
  label,
  onChangeText,
  value,
}: {
  label: string;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <View className="gap-2">
      <Text className="font-medium text-default-foreground text-sm">{label}</Text>
      <Input
        autoCapitalize="none"
        autoCorrect={false}
        className="h-10 min-h-0 rounded-xl px-3 py-0 text-base leading-5"
        keyboardType="url"
        onChangeText={onChangeText}
        placeholder="https://api.example.com"
        style={providerApiServiceStyles.input}
        value={value}
        variant="secondary"
      />
    </View>
  );
}
