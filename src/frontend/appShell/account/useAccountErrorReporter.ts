import { useToast } from '@cherrystudio/ui/components';
import { loggerService } from '@logger';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { AccountError, type AccountErrorCode } from '@/shared/contracts/account';

const ACCOUNT_ERROR_KEYS = {
  unavailable: 'account.error.unavailable',
  address: 'account.error.address',
  connection: 'account.error.connection',
  credentials: 'account.error.credentials',
  failed: 'account.error.failed',
  response: 'account.error.response',
  rejected: 'account.error.rejected',
} as const satisfies Record<AccountErrorCode, string>;

export function useAccountErrorReporter(context: string) {
  const { t } = useTranslation();
  const { toast } = useToast();
  return useCallback(
    (error: unknown, operation = 'account.action') => {
      loggerService
        .withContext(context)
        .error('Account operation failed', error as Error, { operation });
      const code = error instanceof AccountError ? error.code : 'failed';
      toast.show({ label: t(ACCOUNT_ERROR_KEYS[code]), variant: 'danger' });
    },
    [context, t, toast],
  );
}
