import { Button, Description, Input, Label, TextField } from '@cherrystudio/ui/components';
import { ENDPOINT_TYPE } from '@cherrystudio/universal/data/types/model';
import type { ApiKeyEntry } from '@cherrystudio/universal/data/types/provider';
import { type MenuAction, MenuView, type NativeActionEvent } from '@expo/ui/community/menu';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { EyeIcon, EyeOffIcon, ImageUpIcon, RotateCcwIcon } from 'lucide-uniwind/png';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useAlert } from '@/frontend/components/AlertProvider';
import { BackHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { Image } from '@/frontend/components/nativePrimitives';
import { useBackendModule, useMutation } from '@/frontend/data';
import { keyboardBottomOffset } from '@/frontend/utils/constants';

import { normalizeApiKeySingleLine } from './apiService/utils/providerApiServiceApiKeys';
import {
  buildCustomProviderCreationPayload,
  type CustomProviderEndpointUrls,
  findInvalidCustomProviderEndpointUrl,
} from './apiService/utils/providerApiServiceEndpointRules';

const avatarPreviewSize = 96;

type CreateProviderFormValues = {
  apiKey: string;
  avatarUri: string | null;
  endpointUrls: CustomProviderEndpointUrls;
  name: string;
};

export default function NewProviderScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const providers = useBackendModule('providers');

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [avatarDraftUri, setAvatarDraftUri] = useState<string | null>(null);
  const [anthropicUrl, setAnthropicUrl] = useState('');
  const [geminiUrl, setGeminiUrl] = useState('');
  const [imageEditUrl, setImageEditUrl] = useState('');
  const [imageGenerationUrl, setImageGenerationUrl] = useState('');
  const [openaiResponsesUrl, setOpenaiResponsesUrl] = useState('');

  const createProviderMutation = useMutation('POST', '/providers', {
    refresh: ['/providers'],
  });
  const enableProviderMutation = useMutation('PATCH', '/providers/:id', {
    refresh: ['/providers'],
  });
  const createProvider = createProviderMutation.trigger;
  const enableProvider = enableProviderMutation.trigger;
  const isCreating = createProviderMutation.isLoading || enableProviderMutation.isLoading;

  const submitProvider = useCallback(
    async (values: CreateProviderFormValues) => {
      const providerId = Crypto.randomUUID();
      const trimmedApiKey = values.apiKey.trim();
      const { defaultChatEndpoint, endpointConfigs } = buildCustomProviderCreationPayload({
        endpointUrls: values.endpointUrls,
        preferredChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      });

      const apiKeys: ApiKeyEntry[] | undefined = trimmedApiKey
        ? [{ id: Crypto.randomUUID(), isEnabled: true, key: trimmedApiKey }]
        : undefined;

      await createProvider({
        body: {
          apiKeys,
          authConfig: { type: 'api-key' },
          defaultChatEndpoint,
          endpointConfigs,
          name: values.name.trim(),
          providerId,
        },
      });

      if (values.avatarUri) {
        await providers.persistAvatar(providerId, values.avatarUri);
      }

      // Providers are created disabled; the user asked for new custom providers to
      // land already enabled, so flip it on before navigating to the detail page.
      await enableProvider({
        body: { isEnabled: true },
        params: { id: providerId },
      });

      return providerId;
    },
    [createProvider, enableProvider, providers],
  );

  const canSubmit = name.trim().length > 0 && baseUrl.trim().length > 0;
  const handleFinish = useCallback(() => {
    if (!canSubmit || isCreating) {
      return;
    }

    const endpointUrls: CustomProviderEndpointUrls = {
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: baseUrl,
      [ENDPOINT_TYPE.OPENAI_RESPONSES]: openaiResponsesUrl,
      [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: anthropicUrl,
      [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: geminiUrl,
      [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION]: imageGenerationUrl,
      [ENDPOINT_TYPE.OPENAI_IMAGE_EDIT]: imageEditUrl,
    };
    if (findInvalidCustomProviderEndpointUrl(endpointUrls)) {
      alert.show({
        description: t('settings.provider.apiService.invalidBaseUrlMessage'),
        title: t('settings.provider.apiService.invalidBaseUrlTitle'),
      });
      return;
    }

    Keyboard.dismiss();

    const trimmedName = name.trim();
    void submitProvider({
      apiKey,
      avatarUri: avatarDraftUri,
      endpointUrls,
      name,
    })
      .then((providerId) => {
        router.replace({
          params: {
            providerId,
            providerName: trimmedName,
            returnToConfiguration: 'true',
          },
          pathname: '/settings/provider/[providerId]/model-pull',
        });
      })
      .catch(() => {
        alert.show({ title: t('settings.provider.add.error') });
      });
  }, [
    alert,
    anthropicUrl,
    apiKey,
    avatarDraftUri,
    baseUrl,
    canSubmit,
    geminiUrl,
    imageEditUrl,
    imageGenerationUrl,
    isCreating,
    name,
    openaiResponsesUrl,
    router,
    submitProvider,
    t,
  ]);

  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.save'),
        disabled: !canSubmit || isCreating,
        key: 'finish-new-provider',
        label: t('common.save'),
        onPress: handleFinish,
      },
    ],
    [canSubmit, handleFinish, isCreating, t],
  );

  return (
    <>
      <BackHeader rightActions={rightActions} title={t('settings.provider.add.title')} />
      <KeyboardAwareScrollView
        alwaysBounceVertical={false}
        bottomOffset={keyboardBottomOffset}
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        disableScrollOnKeyboardHide
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        mode="layout"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-6 px-6 py-8">
          <NewProviderAvatarSection
            avatarUri={avatarDraftUri}
            name={name}
            onAvatarChange={setAvatarDraftUri}
          />

          <FormField label={t('settings.provider.add.name')} required>
            <Input
              accessibilityLabel={t('settings.provider.add.name')}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setName}
              placeholder={t('settings.provider.add.namePlaceholder')}
              value={name}
            />
          </FormField>

          <FormField label={t('settings.provider.apiService.baseUrl')} required>
            <Input
              accessibilityLabel={t('settings.provider.apiService.baseUrl')}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onChangeText={setBaseUrl}
              placeholder={t('settings.provider.apiService.baseUrlPlaceholder')}
              value={baseUrl}
            />
          </FormField>

          <FormField label={t('settings.provider.apiService.apiKey')}>
            <View className="flex-row items-center gap-2">
              <View className="min-w-0 flex-1 overflow-hidden">
                <Input
                  accessibilityLabel={t('settings.provider.apiService.apiKey')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  lineBreakModeIOS="clip"
                  multiline={false}
                  numberOfLines={1}
                  onChangeText={(value) => setApiKey(normalizeApiKeySingleLine(value))}
                  placeholder={t('settings.provider.apiService.apiKeyPlaceholder')}
                  returnKeyType="done"
                  scrollEnabled={false}
                  secureTextEntry={!apiKeyVisible}
                  value={apiKey}
                />
              </View>
              <Button
                accessibilityLabel={
                  apiKeyVisible
                    ? t('settings.provider.apiService.hideApiKeys')
                    : t('settings.provider.apiService.showApiKeys')
                }
                hitSlop={6}
                icon={apiKeyVisible ? <EyeIcon strokeWidth={2} /> : <EyeOffIcon strokeWidth={2} />}
                onPress={() => setApiKeyVisible((visible) => !visible)}
                variant="secondary"
              />
            </View>
          </FormField>

          <View className="gap-4">
            <Text className="font-medium text-foreground text-sm">
              {t('settings.provider.apiService.moreEndpoints')}
            </Text>
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
            <EndpointField
              description={t('settings.provider.apiService.imageGenerationBaseUrlHelp')}
              label={t('settings.provider.add.endpoint.imageGeneration')}
              onChangeText={setImageGenerationUrl}
              value={imageGenerationUrl}
            />
            <EndpointField
              description={t('settings.provider.apiService.imageEditBaseUrlHelp')}
              label={t('settings.provider.add.endpoint.imageEdit')}
              onChangeText={setImageEditUrl}
              value={imageEditUrl}
            />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </>
  );
}

function NewProviderAvatarSection({
  avatarUri,
  name,
  onAvatarChange,
}: {
  avatarUri: string | null;
  name: string;
  onAvatarChange: (uri: string | null) => void;
}) {
  const { t } = useTranslation();

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
      onAvatarChange(assetUri);
    }
  }, [onAvatarChange]);

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
      onAvatarChange(assetUri);
    }
  }, [onAvatarChange]);

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
  const resetAvatar = useCallback(() => onAvatarChange(null), [onAvatarChange]);

  return (
    <View className="items-center gap-4">
      <AvatarPreview name={name} size={avatarPreviewSize} uri={avatarUri} />
      <View className="flex-row items-center gap-3">
        <MenuView actions={uploadActions} onPressAction={handleUploadAction}>
          <Button icon={<ImageUpIcon strokeWidth={2} />} variant="secondary">
            {t('settings.provider.add.uploadImage')}
          </Button>
        </MenuView>
        <Button
          disabled={!avatarUri}
          icon={<RotateCcwIcon strokeWidth={2} />}
          onPress={resetAvatar}
          variant="secondary"
        >
          {t('settings.provider.add.resetAvatar')}
        </Button>
      </View>
    </View>
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
    <View className="items-center justify-center bg-secondary" style={frameStyle}>
      <Text className="font-medium text-foreground" style={{ fontSize: Math.round(size * 0.42) }}>
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
    <TextField isRequired={required}>
      <Label>{label}</Label>
      {children}
    </TextField>
  );
}

function EndpointField({
  description,
  label,
  onChangeText,
  value,
}: {
  description?: string;
  label: string;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <TextField>
      <Label>{label}</Label>
      <Input
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        onChangeText={onChangeText}
        placeholder="https://api.example.com"
        value={value}
      />
      {description ? <Description>{description}</Description> : null}
    </TextField>
  );
}
