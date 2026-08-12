import { Button, Menu, type MenuItem } from '@cherrystudio/ui/components';
import type { ApiKeyEntry } from '@cherrystudio/universal/data/types/provider';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { ImageUpIcon, RotateCcwIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useAlert } from '@/frontend/components/AlertProvider';
import { BackHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { Image } from '@/frontend/components/nativePrimitives';
import { useBackendModule, useMutation } from '@/frontend/data';
import { keyboardBottomOffset } from '@/frontend/utils/constants';

import {
  buildCustomProviderCreationPayload,
  type CustomProviderEndpointUrls,
  findInvalidCustomProviderEndpointUrl,
} from './apiService/utils/providerApiServiceEndpointRules';
import {
  createInitialCustomProviderFormValue,
  CustomProviderForm,
  type CustomProviderFormValue,
  isCustomProviderFormComplete,
} from './components/CustomProviderForm';

const avatarPreviewSize = 96;

type CreateProviderFormValues = {
  avatarUri: string | null;
} & CustomProviderFormValue;

export default function NewProviderScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const providers = useBackendModule('providers');

  const [formValue, setFormValue] = useState(createInitialCustomProviderFormValue);
  const [avatarDraftUri, setAvatarDraftUri] = useState<string | null>(null);

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
        preferredChatEndpoint: values.defaultChatEndpoint,
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

  const canSubmit = isCustomProviderFormComplete(formValue);
  const handleFinish = useCallback(() => {
    if (!canSubmit || isCreating) {
      return;
    }

    const endpointUrls: CustomProviderEndpointUrls = formValue.endpointUrls;
    if (findInvalidCustomProviderEndpointUrl(endpointUrls)) {
      alert.show({
        description: t('settings.provider.apiService.invalidBaseUrlMessage'),
        title: t('settings.provider.apiService.invalidBaseUrlTitle'),
      });
      return;
    }

    Keyboard.dismiss();

    const trimmedName = formValue.name.trim();
    void submitProvider({
      avatarUri: avatarDraftUri,
      ...formValue,
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
  }, [alert, avatarDraftUri, canSubmit, formValue, isCreating, router, submitProvider, t]);

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
            name={formValue.name}
            onAvatarChange={setAvatarDraftUri}
          />
          <CustomProviderForm disabled={isCreating} onChange={setFormValue} value={formValue} />
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

  const resetAvatar = useCallback(() => onAvatarChange(null), [onAvatarChange]);
  const avatarMenuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        id: 'camera',
        label: t('chat.media.camera'),
        onPress: () => void selectAvatarFromCamera(),
        systemImage: 'camera',
      },
      {
        id: 'photos',
        label: t('chat.media.photos'),
        onPress: () => void selectAvatarFromPhotoLibrary(),
        systemImage: 'photo',
      },
    ],
    [selectAvatarFromCamera, selectAvatarFromPhotoLibrary, t],
  );

  return (
    <View className="items-center gap-4">
      <AvatarPreview name={name} size={avatarPreviewSize} uri={avatarUri} />
      <View className="flex-row items-center gap-3">
        <Menu items={avatarMenuItems} trigger="tap">
          <Button icon={<ImageUpIcon strokeWidth={2} />} variant="secondary">
            {t('settings.provider.add.uploadImage')}
          </Button>
        </Menu>
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
