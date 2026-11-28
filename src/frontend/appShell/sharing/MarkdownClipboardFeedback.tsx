import { useToast } from '@cherrystudio/ui/components';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DeviceEventEmitter, Platform } from 'react-native';

/** One listener for all native Markdown selections. The event carries no clipboard content. */
export function MarkdownClipboardFeedback() {
  const { toast } = useToast();
  const { t } = useTranslation();
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = DeviceEventEmitter.addListener(
      'enrichedMarkdownClipboardWriteFailed',
      () => {
        toast.show({ label: t('sharing.clipboardWriteFailed'), variant: 'danger' });
      },
    );
    return () => subscription.remove();
  }, [t, toast]);
  return null;
}
