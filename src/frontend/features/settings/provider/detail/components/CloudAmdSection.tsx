import { Section, Spinner, useToast } from '@cherrystudio/ui/components';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import type { CloudAmdState, CloudAmdStatus, CloudModule } from '@/shared/contracts/cloud';

function amdActionLabel({ action, activated, registration_enabled, status }: CloudAmdStatus) {
  switch (action) {
    case 'register':
      return registration_enabled ? 'cloud.amd.activate' : 'cloud.amd.link';
    case 'login':
      return status === 'credential_invalid' || status === 'inactive'
        ? 'cloud.amd.verify'
        : 'cloud.amd.link';
    case 'continue':
      return 'cloud.amd.continue';
    case 'none':
      return activated ? 'cloud.amd.viewUsage' : undefined;
    default:
      return undefined;
  }
}

export function CloudAmdSection({
  amd,
  cloud,
}: {
  amd: CloudAmdState | undefined;
  cloud: CloudModule;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const focus = useRef<AbortController | null>(null);
  const opening = useRef(false);
  const [isOpening, setIsOpening] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const current = new AbortController();
      focus.current = current;
      return () => {
        focus.current = null;
        current.abort();
      };
    }, []),
  );

  if (amd?.phase !== 'ready') {
    return amd?.phase === 'error' ? (
      <Section title={t('cloud.amd.title')}>
        <Section.Item
          description={t('chat.errorPart.reason.providerUnavailable')}
          label={t('common.retry')}
          onPress={() => void cloud.refreshAmd()}
        />
      </Section>
    ) : null;
  }

  const status = amd.status;
  const actionLabel = amdActionLabel(status);
  const statusLabel = status.activated
    ? 'cloud.amd.linked'
    : status.action === 'contact_support'
      ? 'cloud.amd.contactSupport'
      : status.action === 'wait'
        ? 'cloud.amd.pending'
        : 'chat.errorPart.reason.providerUnavailable';
  const open = async () => {
    const current = focus.current;
    if (!current || opening.current) return;
    opening.current = true;
    setIsOpening(true);
    try {
      const entry = await cloud.createAmdEntry();
      if (current.signal.aborted) return;
      await Linking.openURL(entry);
    } catch {
      if (!current.signal.aborted) {
        toast.show({ label: t('cloud.amd.openFailed'), variant: 'danger' });
        void cloud.refreshAmd();
      }
    } finally {
      opening.current = false;
      setIsOpening(false);
    }
  };

  return (
    <Section title={t('cloud.amd.title')}>
      <Section.Item
        accessibilityState={{ busy: isOpening }}
        description={
          actionLabel
            ? t(
                status.activated && status.action === 'none'
                  ? 'cloud.amd.linked'
                  : 'cloud.amd.sameAccount',
              )
            : undefined
        }
        disabled={isOpening}
        label={t(actionLabel ?? statusLabel)}
        onPress={actionLabel ? () => void open() : undefined}
        showChevron={Boolean(actionLabel) && !isOpening}
        testID="cloud-amd-status"
        trailing={isOpening ? <Spinner /> : undefined}
      />
    </Section>
  );
}
