import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import { Button, Chip, useToast } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { ModelAvatar } from '@/frontend/components/Avatar';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import { isImageGenerationModel, isTextGenerationModel } from '@/shared/utils/modelPurpose';

import { SettingsScrollPage } from '../../../components/SettingsScrollPage';
import { getProviderModelEndpointLabelKey } from '../../models/utils/providerModelAdd';
import { ProviderModelPage } from './components/ProviderModelPage';

const capabilityLabelKeys = {
  'function-call': 'models.capability.functionCall',
  reasoning: 'models.capability.reasoning',
  'image-recognition': 'models.capability.imageRecognition',
  'image-generation': 'models.capability.imageGeneration',
  'audio-recognition': 'models.capability.audioRecognition',
  'audio-generation': 'models.capability.audioGeneration',
  embedding: 'models.capability.embedding',
  rerank: 'models.capability.rerank',
  'audio-transcript': 'models.capability.audioTranscript',
  'video-recognition': 'models.capability.videoRecognition',
  'video-generation': 'models.capability.videoGeneration',
  'structured-output': 'models.capability.structuredOutput',
  'file-input': 'models.capability.fileInput',
  'web-search': 'models.capability.webSearch',
  'code-execution': 'models.capability.codeExecution',
  'file-search': 'models.capability.fileSearch',
  'computer-use': 'models.capability.computerUse',
} as const satisfies Record<Model['capabilities'][number], string>;

export default function ProviderModelScreen() {
  return (
    <ProviderModelPage>
      {(model, provider) => <ModelDetails model={model} provider={provider} />}
    </ProviderModelPage>
  );
}

function ModelDetails({ model, provider }: { model: Model; provider: Provider }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const edit = () =>
    router.push({
      pathname: '/settings/provider/[providerId]/model-edit',
      params: { providerId: provider.id, modelId: model.id },
    });
  const purpose = t(
    isTextGenerationModel(model)
      ? 'settings.provider.models.section.chat'
      : isImageGenerationModel(model)
        ? 'settings.provider.models.section.painting'
        : 'settings.provider.models.detail.otherPurpose',
  );
  const limits = [
    {
      field: 'maxInputTokens',
      label: t('settings.provider.models.detail.inputLimit'),
      value: model.maxInputTokens,
    },
    {
      field: 'maxOutputTokens',
      label: t('settings.provider.models.detail.outputLimit'),
      value: model.maxOutputTokens,
    },
  ].filter((limit) => limit.value != null && limit.value > 0);
  const hasContextWindow = model.contextWindow != null && model.contextWindow > 0;
  const hasCapabilities =
    model.capabilities.length > 0 ||
    Boolean(model.inputModalities?.length || model.outputModalities?.length);
  const endpoint = model.endpointTypes?.length
    ? model.endpointTypes.map((type) => t(getProviderModelEndpointLabelKey(type))).join(' · ')
    : t('settings.provider.models.endpoint.followDefault', {
        endpoint: provider.defaultChatEndpoint
          ? t(getProviderModelEndpointLabelKey(provider.defaultChatEndpoint))
          : t('settings.provider.models.endpoint.unavailable'),
      });
  const copyModelId = async () => {
    try {
      await Clipboard.setStringAsync(model.modelId);
      toast.show({ label: t('settings.provider.models.detail.copied'), variant: 'success' });
    } catch {
      toast.show({ label: t('settings.provider.models.detail.copyFailed'), variant: 'danger' });
    }
  };
  return (
    <SettingsScrollPage
      headerProps={{
        title: t('settings.provider.models.detail.title'),
        rightActions: [
          {
            type: 'label',
            key: 'edit-model',
            label: t('common.edit'),
            accessibilityLabel: t('settings.provider.models.management.edit'),
            onPress: edit,
          },
        ],
      }}
      contentClassName="gap-8 px-5 pb-10"
    >
      <View className="gap-5">
        <View className="flex-row items-center gap-4">
          <ModelAvatar model={model} provider={provider} size={56} />
          <View className="min-w-0 flex-1 gap-1">
            <Text accessibilityRole="header" className="font-semibold text-foreground text-2xl">
              {model.name}
            </Text>
            <Text className="text-foreground-secondary text-sm">
              {provider.name} · {purpose}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2 rounded-xl bg-secondary py-1 pr-1 pl-4">
          <View className="min-w-0 flex-1 gap-1 py-2">
            <Text className="text-foreground-secondary text-xs">
              {t('settings.provider.models.detail.modelId')}
            </Text>
            <Text className="font-mono text-foreground text-sm">{model.modelId}</Text>
          </View>
          <Button
            accessibilityLabel={t('settings.provider.models.detail.copyId')}
            icon={<CopyIcon />}
            onPress={() => void copyModelId()}
            size="lg"
            variant="ghost"
          />
        </View>
      </View>

      {hasContextWindow || limits.length > 0 ? (
        <View className="gap-4">
          <View className="flex-row flex-wrap items-baseline justify-between gap-2">
            <Text accessibilityRole="header" className="font-semibold text-foreground text-base">
              {t('settings.provider.models.detail.specifications')}
            </Text>
            <Text className="text-foreground-secondary text-xs">
              {t('settings.provider.models.detail.tokenUnit')}
            </Text>
          </View>
          {hasContextWindow ? (
            <View className="gap-1">
              <Text className="text-foreground-secondary text-sm">
                {t('settings.provider.models.detail.contextWindow')}
              </Text>
              <Text className="font-semibold text-foreground text-3xl" style={styles.number}>
                {model.contextWindow?.toLocaleString()}
              </Text>
            </View>
          ) : null}
          {limits.length > 0 ? (
            <View className="flex-row flex-wrap gap-4">
              {limits.map((limit) => (
                <View className="min-w-32 flex-1 gap-1" key={limit.field}>
                  <Text className="text-foreground-secondary text-sm">{limit.label}</Text>
                  <Text className="font-medium text-foreground text-xl" style={styles.number}>
                    {limit.value?.toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {hasCapabilities ? (
        <View className="gap-3">
          <Text accessibilityRole="header" className="font-semibold text-foreground text-base">
            {t('settings.provider.models.detail.capabilities')}
          </Text>
          {model.capabilities.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {model.capabilities.map((capability) => (
                <Chip.Tag key={capability}>{t(capabilityLabelKeys[capability])}</Chip.Tag>
              ))}
            </View>
          ) : null}
          {model.inputModalities?.length || model.outputModalities?.length ? (
            <View className="gap-3">
              {model.inputModalities?.length ? (
                <ModelDetailField
                  label={t('settings.provider.models.detail.input')}
                  value={model.inputModalities
                    .map((modality) => t(`settings.provider.models.detail.modality.${modality}`))
                    .join(' · ')}
                />
              ) : null}
              {model.outputModalities?.length ? (
                <ModelDetailField
                  label={t('settings.provider.models.detail.output')}
                  value={model.outputModalities
                    .map((modality) => t(`settings.provider.models.detail.modality.${modality}`))
                    .join(' · ')}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <View className="gap-4">
        <Text accessibilityRole="header" className="font-semibold text-foreground text-base">
          {t('settings.provider.models.detail.configuration')}
        </Text>
        <View className="gap-3">
          <ModelDetailField
            label={t('settings.provider.models.detail.source')}
            value={t(
              model.presetModelId
                ? 'settings.provider.models.detail.catalog'
                : 'settings.provider.models.detail.custom',
            )}
          />
          <ModelDetailField
            label={t('settings.provider.models.detail.endpoint')}
            value={endpoint}
          />
          {model.group?.trim() ? (
            <ModelDetailField
              label={t('settings.provider.models.detail.group')}
              value={model.group}
            />
          ) : null}
        </View>
      </View>

      {model.description?.trim() ? (
        <View className="gap-3">
          <Text accessibilityRole="header" className="font-semibold text-foreground text-base">
            {t('settings.provider.models.detail.description')}
          </Text>
          <Text className="text-foreground-secondary text-sm">{model.description}</Text>
        </View>
      ) : null}
      {model.notes?.trim() ? (
        <View className="gap-3">
          <Text accessibilityRole="header" className="font-semibold text-foreground text-base">
            {t('settings.provider.models.detail.notes')}
          </Text>
          <Text className="text-foreground-secondary text-sm">{model.notes}</Text>
        </View>
      ) : null}
    </SettingsScrollPage>
  );
}

function ModelDetailField({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start gap-4">
      <Text className="max-w-2/5 shrink text-foreground-secondary text-sm">{label}</Text>
      <Text className="min-w-0 flex-1 text-right text-foreground text-sm">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  number: { fontVariant: ['tabular-nums'] },
});
