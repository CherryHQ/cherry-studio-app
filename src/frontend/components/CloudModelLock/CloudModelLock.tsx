import LockIcon from '@cherrystudio/app-icons/icons/lock';
import { Text, View } from 'react-native';

import type { CloudModelOffer } from '@/frontend/appShell/cloud';

export function getCloudModelLockLabelKey(offer: CloudModelOffer) {
  switch (offer.reason) {
    case 'signed_out':
    case 'reauth_required':
      return 'account.login.signIn';
    case 'subscription_required':
      return 'cloud.subscription';
    case 'activation_required':
      return offer.isAmd ? 'cloud.amd.shortName' : undefined;
    default:
      return undefined;
  }
}

export function CloudModelLock({ label }: { label?: string }) {
  return (
    <View className="min-w-5 max-w-[40%] shrink-0 flex-row items-center justify-center gap-1">
      <LockIcon className="size-3.5 text-muted-foreground" />
      {label ? <Text className="shrink text-muted-foreground text-xs">{label}</Text> : null}
    </View>
  );
}
