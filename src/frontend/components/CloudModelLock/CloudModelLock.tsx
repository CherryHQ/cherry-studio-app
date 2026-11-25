import LockIcon from '@cherrystudio/app-icons/icons/lock';
import { StyleSheet, Text, View } from 'react-native';

import type { CloudModelOffer } from '@/frontend/appShell/cloud';
import type { CloudAmdStatus } from '@/shared/contracts/cloud';

function getAmdLockLabelKey(status: CloudAmdStatus | undefined) {
  switch (status?.action) {
    case 'register':
      return 'cloud.amd.action.register';
    case 'login':
      return status.status === 'credential_invalid'
        ? 'cloud.amd.action.reverify'
        : 'cloud.amd.action.link';
    case 'continue':
      return 'cloud.amd.continue';
    case 'wait':
      return 'cloud.amd.action.wait';
    case 'contact_support':
      return 'cloud.amd.action.contactSupport';
    default:
      return 'cloud.amd.tag';
  }
}

export function getCloudModelLockLabelKey(offer: CloudModelOffer) {
  switch (offer.reason) {
    case 'signed_out':
      return offer.isAmd && offer.model.activation_required
        ? getAmdLockLabelKey(offer.amdStatus)
        : 'account.login.signIn';
    case 'reauth_required':
      return 'account.login.signIn';
    case 'subscription_required':
      return 'cloud.subscription';
    case 'activation_required':
      return offer.isAmd ? getAmdLockLabelKey(offer.amdStatus) : undefined;
    default:
      return undefined;
  }
}

export function CloudModelLock({ label }: { label?: string }) {
  if (!label) {
    return (
      <View
        accessibilityElementsHidden
        className="min-w-5 shrink-0 flex-row items-center justify-center"
        importantForAccessibility="no-hide-descendants"
        testID="cloud-model-lock-icon"
      >
        <LockIcon className="size-3.5 text-muted-foreground" />
      </View>
    );
  }

  return (
    <View
      accessibilityElementsHidden
      className="max-w-[45%] shrink-0 flex-row items-center justify-center gap-1 rounded-xl bg-tag-amber px-2 py-0.5"
      importantForAccessibility="no-hide-descendants"
      style={styles.tag}
      testID="cloud-model-lock-tag"
    >
      <LockIcon className="size-3 shrink-0 text-tag-amber-foreground" />
      <Text className="shrink font-medium text-xs text-tag-amber-foreground">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    borderCurve: 'continuous',
  },
});
