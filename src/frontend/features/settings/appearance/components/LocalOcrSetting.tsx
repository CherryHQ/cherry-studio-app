import TrashIcon from '@cherrystudio/app-icons/icons/trash-2';
import { BottomSheet, Button, Section, useToast } from '@cherrystudio/ui/components';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data/BackendProvider';
import { usePreference } from '@/frontend/data/hooks';
import type { FileOcrEngine, LocalOcrModelState } from '@/shared/contracts/localOcr';

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
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [engine, setEngine] = usePreference('file.ocr.engine');
  const [model, setModel] = useState<LocalOcrModelState>();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  useEffect(() => localOcr.observe(setModel), [localOcr]);

  const status = model?.status ?? 'checking';
  const isReady = status === 'ready';
  const unavailable = model?.reason === 'unavailable';
  const percent = model ? Math.floor((model.receivedBytes / model.totalBytes) * 100) : 0;
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });
  const size = number.format((model?.totalBytes ?? 0) / 1_000_000);
  const selectedEngine = engine === 'xiaomi' && isReady ? 'xiaomi' : 'system';
  const reportFailure = () =>
    toast.show({ label: t('settings.localOcr.actionFailed'), variant: 'danger' });
  const changeEngine = (value: FileOcrEngine) => {
    if (value === 'xiaomi' && !isReady) {
      toast.show({
        label: t(unavailable ? 'settings.localOcr.unavailable' : 'settings.localOcr.downloadFirst'),
        variant: 'danger',
      });
      return;
    }
    void setEngine(value)
      .then(() => setIsPickerOpen(false))
      .catch(reportFailure);
  };
  const remove = async () => {
    setIsRemoving(true);
    try {
      await localOcr.remove();
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
        value={selectedEngine === 'xiaomi' ? 'Xiaomi-OCR-0' : t('settings.localOcr.system')}
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
                disabled={isRemoving}
                label="Xiaomi-OCR-0"
                onPress={() => changeEngine('xiaomi')}
                selected={selectedEngine === 'xiaomi'}
              />
            </View>
            <View className="shrink-0 flex-row items-center gap-1">
              {status === 'downloading' ? (
                <Button
                  disabled={isRemoving}
                  onPress={() => {
                    void localOcr.pause().catch(reportFailure);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  {t('settings.localOcr.pause')}
                </Button>
              ) : !isReady && status !== 'checking' && status !== 'verifying' ? (
                <Button
                  disabled={isRemoving || unavailable}
                  onPress={() => {
                    void localOcr.download().catch(reportFailure);
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
                  disabled={isRemoving}
                  icon={<TrashIcon />}
                  onPress={() => {
                    void remove();
                  }}
                  variant="ghost"
                  size="sm"
                />
              ) : null}
            </View>
          </View>
        </ScrollView>
      </BottomSheet>
    </>
  );
}
