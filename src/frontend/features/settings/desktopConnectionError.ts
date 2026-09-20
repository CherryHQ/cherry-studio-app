import type { TFunction } from 'i18next';
import { Platform } from 'react-native';

import { DataApiError } from '@/shared/data/api/errors';

export function desktopConnectionErrorMessage(error: unknown, t: TFunction): string {
  const reason = error instanceof DataApiError ? error.details?.reason : undefined;
  if (typeof reason === 'string') {
    // iOS can deny every attempt while the Local Network permission is undetermined, which the
    // pairing flow reports as `unreachable`; point the user at that permission, not the network.
    const key =
      reason === 'unreachable' && Platform.OS === 'ios'
        ? 'settings.desktopConnection.error.unreachable.ios'
        : `settings.desktopConnection.error.${reason}`;
    const translated = t(key);
    if (translated !== key) {
      return translated;
    }
  }
  return t('settings.desktopConnection.error.unknown');
}
