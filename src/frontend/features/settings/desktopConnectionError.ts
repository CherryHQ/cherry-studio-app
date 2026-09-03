import type { TFunction } from 'i18next';

import { DataApiError } from '@/shared/data/api/errors';

export function desktopConnectionErrorMessage(error: unknown, t: TFunction): string {
  const reason = error instanceof DataApiError ? error.details?.reason : undefined;
  if (typeof reason === 'string') {
    const key = `settings.desktopConnection.error.${reason}`;
    const translated = t(key);
    if (translated !== key) {
      return translated;
    }
  }
  return t('settings.desktopConnection.error.unknown');
}
