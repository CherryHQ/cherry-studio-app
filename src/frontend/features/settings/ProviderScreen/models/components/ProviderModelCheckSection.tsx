import { ChevronRightIcon } from '@cherrystudio/app-icons';
import { Button, Section } from '@cherrystudio/ui/components';
import type { Model } from '@cherrystudio/universal/data/types/model';
import type { ApiKeyEntry } from '@cherrystudio/universal/data/types/provider';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useProviderModelCheck } from '../hooks/useProviderModelCheck';

type ProviderModelCheckSectionProps = {
  apiKeys: readonly ApiKeyEntry[] | undefined;
  isLoading?: boolean;
  models: readonly Model[];
  /** Both picked on pushed screens, so both arrive as route params. */
  onOpenApiKeySelect: () => void;
  onOpenModelSelect: () => void;
  providerId: string;
  selectedApiKeyId?: string;
  selectedModelId?: string;
};

export function ProviderModelCheckSection({
  apiKeys,
  isLoading = false,
  models,
  onOpenApiKeySelect,
  onOpenModelSelect,
  providerId,
  selectedApiKeyId,
  selectedModelId,
}: ProviderModelCheckSectionProps) {
  const { t } = useTranslation();
  const { isChecking, modelStatus, selectedApiKey, selectedModel, startCheck } =
    useProviderModelCheck({ apiKeys, models, providerId, selectedApiKeyId, selectedModelId });

  return (
    <View className="gap-5">
      <Section>
        {/* Section's own `title` slot indents the header by 12px, which would
            sit it out of line with the API keys field label right above. */}
        <Section.Header className="px-0" title={t('settings.provider.models.checkTitle')} />
        <Section.Item
          disabled={isChecking || isLoading || models.length === 0}
          label={t('settings.provider.models.checkModelSection')}
          onPress={onOpenModelSelect}
          trailing={
            <SelectionRowValue
              label={selectedModel?.name ?? t('settings.provider.models.checkNoModels')}
            />
          }
        />
        <Section.Item
          disabled={isChecking || isLoading}
          label={t('settings.provider.models.checkApiKeySection')}
          onPress={onOpenApiKeySelect}
          trailing={
            <SelectionRowValue
              label={selectedApiKey?.label ?? t('settings.provider.models.checkDefaultApiKey')}
            />
          }
        />
      </Section>

      {modelStatus?.status === 'success' ? <ModelCheckResult status={modelStatus} /> : null}

      <Button
        disabled={isLoading || !selectedModel}
        loading={isChecking}
        onPress={() => void startCheck()}
      >
        {isChecking
          ? t('settings.provider.models.checkChecking')
          : t('settings.provider.models.checkStart')}
      </Button>
    </View>
  );
}

/** The value, then the disclosure of the screen it is picked on. */
function SelectionRowValue({ label }: { label: string }) {
  return (
    <View className="min-w-0 flex-row items-center justify-end gap-1">
      <Text className="min-w-0 shrink text-right text-base text-foreground" numberOfLines={1}>
        {label}
      </Text>
      <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
    </View>
  );
}

function ModelCheckResult({
  status,
}: {
  status: NonNullable<ReturnType<typeof useProviderModelCheck>['modelStatus']>;
}) {
  const { t } = useTranslation();
  const title = t('settings.provider.models.checkSuccess');
  const detail = status.error
    ? status.error
    : status.latency !== undefined
      ? t('settings.provider.models.checkLatency', { latency: status.latency })
      : undefined;

  return (
    <View className="gap-1 rounded-xl bg-grouped-surface px-4 py-3">
      <Text className="text-base text-success">{title}</Text>
      {detail ? (
        <Text selectable className="text-sm text-foreground">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}
