import { useToast } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';

export function useCopyReportId(reportId: string) {
  const { t } = useTranslation();
  const { toast } = useToast();
  return async () => {
    try {
      await Clipboard.setStringAsync(reportId);
      toast.show({ label: t('settings.about.feedback.copySuccess'), variant: 'success' });
    } catch {
      toast.show({ label: t('settings.about.feedback.copyFailed'), variant: 'danger' });
    }
  };
}
