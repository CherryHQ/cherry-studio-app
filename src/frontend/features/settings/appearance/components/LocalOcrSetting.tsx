import TrashIcon from '@cherrystudio/app-icons/icons/trash-2';
import { BottomSheet, Button, Section, useToast } from '@cherrystudio/ui/components';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data/BackendProvider';
import { usePreference } from '@/frontend/data/hooks';
import type {
  FileOcrEngine,
  LocalOcrModelId,
  LocalOcrModelState,
} from '@/shared/contracts/localOcr';

const MODEL_LABELS = { xiaomi: 'Xiaomi-OCR-0', ovis: 'OvisOCR3' } satisfies Record<
  LocalOcrModelId,
  string
>;
const MODEL_IDS: LocalOcrModelId[] = ['xiaomi', 'ovis'];

const STATUS_KEYS = {
  idle: 'settings.localOcr.idle',
  checking: 'settings.localOcr.checking',
  downloading: 'settings.localOcr.downloading',
  paused: 'settings.localOcr.paused',
  verifying: 'settings.localOcr.verifying',
  ready: 'settings.localOcr.ready',
  failed: 'settings.localOcr.downloadFailed',
} as const;
const FAILURE_KEYS = {
  download: 'settings.localOcr.downloadFailed',
  verification: 'settings.localOcr.verificationFailed',
  storage: 'settings.localOcr.storageFailed',
  unavailable: 'settings.localOcr.unavailable',
} as const;

/** Download progress stays in this leaf; settings owns no transfer or inference lifecycle. */
export function LocalOcrSetting() {
  const localOcr = useBackendModule('file').localOcr;
  const { t } = useTranslation();
  const { toast } = useToast();
  const [engine, setEngine] = usePreference('file.ocr.engine');
  const [ready, setReady] = useState<Record<LocalOcrModelId, boolean>>({
    xiaomi: false,
    ovis: false,
  });
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  useEffect(() => {
    const subscriptions = MODEL_IDS.map((model) =>
      localOcr.observe(model, (state) => {
        const isReady = state.status === 'ready';
        setReady((previous) =>
          previous[model] === isReady ? previous : { ...previous, [model]: isReady },
        );
      }),
    );
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, [localOcr]);

  const selectedEngine = engine !== 'system' && ready[engine] ? engine : 'system';
  const reportFailure = () =>
    toast.show({ label: t('settings.localOcr.actionFailed'), variant: 'danger' });
  const changeEngine = (value: FileOcrEngine) => {
    void setEngine(value)
      .then(() => setIsPickerOpen(false))
      .catch(reportFailure);
  };
  const remove = async (model: LocalOcrModelId) => {
    setIsRemoving(true);
    try {
      await localOcr.remove(model);
    } catch {
      reportFailure();
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <>
      <Section.SelectItem
        disabled={isRemoving}
        label={t('settings.localOcr.title')}
        onPress={() => setIsPickerOpen(true)}
        testID="settings-local-ocr-engine"
        value={
          selectedEngine === 'system' ? t('settings.localOcr.system') : MODEL_LABELS[selectedEngine]
        }
      />
      <BottomSheet
        onClose={() => setIsPickerOpen(false)}
        open={isPickerOpen}
        size="compact"
        title={t('settings.localOcr.title')}
      >
        <ScrollView contentContainerClassName="pt-2" showsVerticalScrollIndicator={false}>
          <Section variant="plain">
            <Section.RadioItem
              disabled={isRemoving}
              label={t('settings.localOcr.system')}
              onPress={() => changeEngine('system')}
              selected={selectedEngine === 'system'}
            />
          </Section>
          {MODEL_IDS.map((model) => (
            <LocalOcrModelRow
              key={model}
              modelId={model}
              disabled={isRemoving}
              selected={selectedEngine === model}
              onSelect={changeEngine}
              onRemove={remove}
            />
          ))}
        </ScrollView>
      </BottomSheet>
    </>
  );
}

/** Each row observes its own transfer; progress never fans out through the settings screen. */
function LocalOcrModelRow({
  modelId,
  disabled,
  selected,
  onSelect,
  onRemove,
}: {
  modelId: LocalOcrModelId;
  disabled: boolean;
  selected: boolean;
  onSelect(model: FileOcrEngine): void;
  onRemove(model: LocalOcrModelId): Promise<void>;
}) {
  const localOcr = useBackendModule('file').localOcr;
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [model, setModel] = useState<LocalOcrModelState>();
  useEffect(() => localOcr.observe(modelId, setModel), [localOcr, modelId]);
  const status = model?.status ?? 'checking';
  const isReady = status === 'ready';
  const unavailable = model?.reason === 'unavailable';
  const percent = model ? Math.floor((model.receivedBytes / model.totalBytes) * 100) : 0;
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });
  const size = number.format((model?.totalBytes ?? 0) / 1_000_000);
  const reportFailure = () =>
    toast.show({ label: t('settings.localOcr.actionFailed'), variant: 'danger' });
  const select = () => {
    if (isReady) onSelect(modelId);
    else
      toast.show({
        label: t(unavailable ? 'settings.localOcr.unavailable' : 'settings.localOcr.downloadFirst'),
        variant: 'danger',
      });
  };
  return (
    <View className="flex-row items-center pr-4">
      <View className="min-w-0 flex-1">
        <Section.RadioItem
          description={
            <Text
              accessibilityLiveRegion="polite"
              accessibilityRole={
                status === 'downloading' || status === 'paused' ? 'progressbar' : undefined
              }
              accessibilityValue={
                status === 'downloading' || status === 'paused'
                  ? { min: 0, max: 100, now: percent }
                  : undefined
              }
              className="text-sm text-muted-foreground"
            >
              {t(model?.reason ? FAILURE_KEYS[model.reason] : STATUS_KEYS[status], {
                percent: number.format(percent),
                size,
              })}
            </Text>
          }
          disabled={disabled}
          label={MODEL_LABELS[modelId]}
          onPress={select}
          selected={selected}
        />
      </View>
      <View className="shrink-0 flex-row items-center gap-1">
        {status === 'downloading' ? (
          <Button
            disabled={disabled}
            onPress={() => {
              void localOcr.pause(modelId).catch(reportFailure);
            }}
            size="sm"
            variant="ghost"
          >
            {t('settings.localOcr.pause')}
          </Button>
        ) : !isReady && status !== 'checking' && status !== 'verifying' ? (
          <Button
            disabled={disabled || unavailable}
            onPress={() => {
              void localOcr.download(modelId).catch(reportFailure);
            }}
            size="sm"
            variant="ghost"
          >
            {status === 'paused'
              ? t('settings.localOcr.resume')
              : status === 'failed'
                ? t('common.retry')
                : t('settings.localOcr.download')}
          </Button>
        ) : null}
        {status !== 'idle' && status !== 'checking' && !unavailable ? (
          <Button
            accessibilityLabel={t('settings.localOcr.remove')}
            disabled={disabled}
            icon={<TrashIcon />}
            onPress={() => {
              void onRemove(modelId);
            }}
            variant="ghost"
            size="sm"
          />
        ) : null}
      </View>
    </View>
  );
}
