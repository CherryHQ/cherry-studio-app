import { BottomSheet, Button } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

import { getPrivacyPolicyUrl } from './privacyPolicy';

/** The sheet has no dismissal path; both exits are decisions in the footer. */
const ignoreClose = () => undefined;

type PrivacyConsentSheetProps = {
  isSaving: boolean;
  onAccept: () => void;
  onDecline: () => void;
  open: boolean;
};

/**
 * The data-collection disclosure, shown before anything is reported and again
 * whenever the policy version changes.
 *
 * It carries its own summary rather than only linking out: a first launch may
 * have no network, and the link is the full text, not the notice itself.
 */
export function PrivacyConsentSheet({
  isSaving,
  onAccept,
  onDecline,
  open,
}: PrivacyConsentSheetProps) {
  const { i18n, t } = useTranslation();
  const policyUrl = getPrivacyPolicyUrl(i18n.language);

  return (
    <BottomSheet
      dismissible={false}
      footer={
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button disabled={isSaving} onPress={onDecline} variant="outline">
              <Button.Label>{t('privacyConsent.decline')}</Button.Label>
            </Button>
          </View>
          <View className="flex-1">
            <Button disabled={isSaving} loading={isSaving} onPress={onAccept}>
              <Button.Label>{t('privacyConsent.accept')}</Button.Label>
            </Button>
          </View>
        </View>
      }
      onClose={ignoreClose}
      open={open}
      size="full"
      testID="privacy-consent-sheet"
      title={t('privacyConsent.title')}
    >
      <ScrollView
        className="min-h-0 flex-1"
        contentContainerClassName="gap-6 px-6 pt-2 pb-4"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-base text-foreground">{t('privacyConsent.intro')}</Text>
        <ConsentGroup
          items={[
            t('privacyConsent.collectedModels'),
            t('privacyConsent.collectedVersion'),
            t('privacyConsent.collectedInstallId'),
          ]}
          title={t('privacyConsent.collectedTitle')}
        />
        <ConsentGroup
          items={[
            t('privacyConsent.excludedConversations'),
            t('privacyConsent.excludedFiles'),
            t('privacyConsent.excludedApiKeys'),
          ]}
          title={t('privacyConsent.excludedTitle')}
        />
        <View className="gap-3">
          <Text className="text-foreground-tertiary text-xs">{t('privacyConsent.optOut')}</Text>
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
      </ScrollView>
    </BottomSheet>
  );
}

/** One scannable list under a quiet heading; the rule separates, nothing encloses. */
function ConsentGroup({ items, title }: { items: readonly string[]; title: string }) {
  return (
    <View className="gap-2">
      <Text className="text-foreground-tertiary text-xs">{title}</Text>
      <View className="gap-2 border-border-subtle border-t pt-3">
        {items.map((item) => (
          <Text className="text-foreground text-sm" key={item}>
            {item}
          </Text>
        ))}
      </View>
    </View>
  );
}
