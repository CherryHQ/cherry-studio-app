import { Button, Dialog } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

import { getPrivacyPolicyUrl } from './privacyPolicy';

/** Consent must be saved before closing, including when Android Back is pressed. */
const ignoreClose = () => undefined;

type PrivacyConsentDialogProps = {
  isSaving: boolean;
  onAccept: () => void;
  onDecline: () => void;
  open: boolean;
};

export function PrivacyConsentDialog({
  isSaving,
  onAccept,
  onDecline,
  open,
}: PrivacyConsentDialogProps) {
  const { i18n, t } = useTranslation();
  const policyUrl = getPrivacyPolicyUrl(i18n.language);

  return (
    <Dialog
      onOpenChange={ignoreClose}
      open={open}
      testID="privacy-consent-dialog"
      title={t('privacyConsent.title')}
    >
      <View className="gap-2">
        <Text className="text-base text-muted-foreground">{t('privacyConsent.intro')}</Text>
        <View className="items-start">
          <Button
            accessibilityRole="link"
            onPress={() => void openExternalUrl(policyUrl)}
            size="inline"
            variant="link"
          >
            {t('privacyConsent.readPolicy')}
          </Button>
        </View>
      </View>
      <View className="gap-3">
        <Button disabled={isSaving} loading={isSaving} onPress={onAccept}>
          {t('privacyConsent.accept')}
        </Button>
        <Button disabled={isSaving} onPress={onDecline} variant="ghost">
          {t('privacyConsent.decline')}
        </Button>
      </View>
    </Dialog>
  );
}
