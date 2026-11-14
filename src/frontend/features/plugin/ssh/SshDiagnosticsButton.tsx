import { Button, useAlert } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import type { SshDiagnostics } from '@/shared/data/types/ssh';

export function SshDiagnosticsButton({ diagnostics }: { diagnostics: SshDiagnostics }) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  return (
    <Button
      variant="ghost"
      size="sm"
      onPress={() =>
        alert.show({
          title: t('ssh.diagnostics'),
          description: JSON.stringify(diagnostics, null, 2),
        })
      }
    >
      {t('ssh.diagnostics')}
    </Button>
  );
}
