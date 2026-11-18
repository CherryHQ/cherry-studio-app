import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { runningUpdate } from '@/backend/services/appUpdate/runningUpdate';
import type { ActiveProfile } from '@/shared/data/activeProfile';
import type { DiagnosticEventContext } from '@/shared/data/types/diagnostics';
import { sha256HexOfText } from '@/shared/utils/sha256';

type AccountContext = Pick<
  DiagnosticEventContext,
  'accountStatus' | 'accountSubjectId' | 'accountIssuerHash'
>;

const version: DiagnosticEventContext = {
  platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : undefined,
  appVersion: Application.nativeApplicationVersion ?? undefined,
  buildNumber: Application.nativeBuildVersion ?? undefined,
  jsVersion: Constants.expoConfig?.version,
  runtimeVersion: runningUpdate.runtimeVersion ?? undefined,
  updateId: runningUpdate.updateId ?? undefined,
  updateChannel: runningUpdate.channel ?? undefined,
  isEmbeddedLaunch: runningUpdate.isEmbeddedLaunch ?? undefined,
};
let profileContext: DiagnosticEventContext = {};
let readAccount: (() => AccountContext) | undefined;

/** Called only after startup selected the data owner; early boot is deliberately unattributed. */
export function setDiagnosticProfile(profile: ActiveProfile): void {
  const { identity } = profile;
  profileContext = {
    profileId: profile.id,
    profileKind: !identity ? 'local' : 'authentication' in identity ? 'private' : 'cloud',
    profileSubjectId: identity?.subject,
    deploymentId: identity?.deployment,
    ...(identity && 'issuer' in identity
      ? {
          organizationId: identity.productProfileId,
          profileIssuerHash: sha256HexOfText(identity.issuer),
        }
      : {}),
  };
}

/** The account runtime remains the source of truth; no diagnostic subscription mirrors it. */
export function setDiagnosticAccountReader(read: () => AccountContext): void {
  readAccount = read;
}

export function captureDiagnosticContext(): DiagnosticEventContext {
  let account: AccountContext = { accountStatus: 'unknown' };
  try {
    account = readAccount?.() ?? account;
  } catch {
    // Keep version/profile context even if the account runtime cannot be inspected.
  }
  return { ...version, ...profileContext, ...account };
}
