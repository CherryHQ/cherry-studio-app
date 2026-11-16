import { LOCAL_PROFILE } from '@/shared/data/activeProfile';
import { sha256HexOfText } from '@/shared/utils/sha256';

import {
  captureDiagnosticContext,
  setDiagnosticAccountReader,
  setDiagnosticProfile,
} from '../diagnosticContext';

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '0.5.0',
  nativeBuildVersion: '42',
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.5.1' } },
}));
jest.mock('@/backend/services/appUpdate/runningUpdate', () => ({
  runningUpdate: {
    runtimeVersion: 'runtime-1',
    updateId: 'update-1',
    channel: 'preview',
    isEmbeddedLaunch: false,
  },
}));

test('captures versions before a profile is selected without inventing a local owner', () => {
  expect(captureDiagnosticContext()).toMatchObject({
    appVersion: '0.5.0',
    buildNumber: '42',
    jsVersion: '0.5.1',
    runtimeVersion: 'runtime-1',
    updateId: 'update-1',
    updateChannel: 'preview',
    isEmbeddedLaunch: false,
    accountStatus: 'unknown',
  });
  expect(captureDiagnosticContext().profileId).toBeUndefined();
});

test('keeps profile ownership distinct from session state and excludes addresses/display names', () => {
  setDiagnosticProfile({
    id: 'profile-1',
    identity: {
      subject: 'subject-1',
      deployment: 'deployment-1',
      issuer: 'https://issuer.example.com',
      productProfileId: 'organization-1',
    },
    address: 'https://private.example.com',
    displayName: 'Private organization',
  });
  setDiagnosticAccountReader(() => ({ accountStatus: 'sign_in_required' }));
  const cloud = captureDiagnosticContext();
  expect(cloud).toMatchObject({
    profileId: 'profile-1',
    profileKind: 'cloud',
    profileSubjectId: 'subject-1',
    deploymentId: 'deployment-1',
    organizationId: 'organization-1',
    profileIssuerHash: sha256HexOfText('https://issuer.example.com'),
    accountStatus: 'sign_in_required',
  });
  expect(cloud.accountSubjectId).toBeUndefined();
  expect(JSON.stringify(cloud)).not.toMatch(/https|Private/);

  setDiagnosticProfile({
    id: 'private-profile',
    identity: { subject: 'private-user', deployment: 'private-server', authentication: 'password' },
    address: 'https://private.example.com',
  });
  expect(captureDiagnosticContext()).toMatchObject({
    profileKind: 'private',
    profileSubjectId: 'private-user',
    deploymentId: 'private-server',
  });
  expect(captureDiagnosticContext().organizationId).toBeUndefined();
  expect(captureDiagnosticContext().profileIssuerHash).toBeUndefined();

  setDiagnosticProfile(LOCAL_PROFILE);
  let subject = 'community-user-1';
  setDiagnosticAccountReader(() => ({ accountStatus: 'signed_in', accountSubjectId: subject }));
  const first = captureDiagnosticContext();
  subject = 'community-user-2';
  expect(first.accountSubjectId).toBe('community-user-1');
  expect(captureDiagnosticContext().accountSubjectId).toBe('community-user-2');
  expect(captureDiagnosticContext().profileSubjectId).toBeUndefined();
  setDiagnosticAccountReader(() => {
    throw new Error('unavailable');
  });
  expect(captureDiagnosticContext()).toMatchObject({
    profileId: 'local',
    appVersion: '0.5.0',
    accountStatus: 'unknown',
  });
  expect(captureDiagnosticContext().accountSubjectId).toBeUndefined();
});
