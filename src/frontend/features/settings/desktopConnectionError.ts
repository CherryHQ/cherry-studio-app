import type { TFunction } from 'i18next';
import { Platform } from 'react-native';

import { DataApiError } from '@/shared/data/api/errors';
import { DesktopConnectionFailureSchema } from '@/shared/data/api/schemas/desktopConnections';

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
    if (reason === 'unreachable' && error instanceof DataApiError) {
      const failures = DesktopConnectionFailureSchema.array()
        .min(1)
        .max(32)
        .safeParse(error.details?.connectionFailures);
      if (failures.success)
        return failures.data
          .map((failure) => {
            if (failure.kind === 'timeout')
              return `${failure.address}\n${t('settings.desktopConnection.error.connection-timeout')}`;
            // OkHttp and SocketRocket expose HTTP rejection only through their native close reason.
            const status = failure.message?.match(
              /^(?:Expected HTTP 101 response but was '([1-5]\d{2})\b|Received bad response code from server: ([1-5]\d{2})\.)/,
            );
            const httpStatus = status ? Number(status[1] ?? status[2]) : undefined;
            const message =
              httpStatus !== undefined && httpStatus !== 101
                ? t(
                    httpStatus === 401 || httpStatus === 403
                      ? 'settings.desktopConnection.error.http-access-denied'
                      : httpStatus >= 500
                        ? 'settings.desktopConnection.error.http-service-unavailable'
                        : 'settings.desktopConnection.error.http-upgrade-rejected',
                    { status: httpStatus },
                  )
                : translated;
            const details = failure.message
              ? t('settings.desktopConnection.error.connection-detail', {
                  message: failure.message,
                })
              : '';
            return [
              failure.address,
              message,
              failure.closeCode ? `WebSocket ${failure.closeCode}` : '',
              details,
            ]
              .filter(Boolean)
              .join('\n');
          })
          .join('\n\n');
    }
    if (translated !== key) {
      return translated;
    }
  }
  return t('settings.desktopConnection.error.unknown');
}
