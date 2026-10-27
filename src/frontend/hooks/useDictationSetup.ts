import { useAlert } from '@cherrystudio/ui/components';
import * as Device from 'expo-device';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import type { VoiceEngineStatus } from '@/shared/contracts/voice';

/** Guidance shared by voice settings and the composer. Device settings own service selection. */
export function useDictationSetup() {
  const { alert } = useAlert();
  const { t } = useTranslation();
  const isXiaomi = Device.manufacturer?.toLowerCase() === 'xiaomi';

  return (status?: VoiceEngineStatus) => {
    const reason =
      status === 'needs-setup'
        ? t('settings.voice.dictation.setupRequired')
        : status === 'unsupported'
          ? t('settings.voice.dictation.systemUnavailable')
          : undefined;
    alert.confirm({
      title: t('settings.voice.dictation.systemSettings'),
      description: [
        reason,
        isXiaomi
          ? t('settings.voice.dictation.setupGuideXiaomi')
          : t('settings.voice.dictation.setupGuide'),
      ]
        .filter(Boolean)
        .join('\n\n'),
      confirmLabel: t('settings.permissions.openSystemSettings'),
      onConfirm: async () => {
        // Xiaomi HyperOS can resolve voice-input settings to assistant-role selection, which
        // does not select a RecognitionService. Open system settings for manual lookup instead.
        const actions = isXiaomi
          ? ['android.settings.SETTINGS']
          : [
              'android.settings.VOICE_INPUT_SETTINGS',
              'android.settings.MANAGE_DEFAULT_APPS_SETTINGS',
              'android.settings.SETTINGS',
            ];
        for (const action of actions) {
          try {
            await Linking.sendIntent(action);
            return;
          } catch {
            // Try the next supported system surface without changing any system preference.
          }
        }
        alert.show({
          title: t('settings.voice.dictation.systemSettings'),
          description: t('settings.voice.dictation.settingsUnavailable'),
        });
      },
    });
  };
}
