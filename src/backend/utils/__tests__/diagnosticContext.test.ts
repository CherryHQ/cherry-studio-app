import {
  installDiagnosticContextReader,
  projectDiagnosticContext,
  readDiagnosticContext,
} from '../diagnosticContext';

afterEach(() => installDiagnosticContextReader(() => ({})));

test('allowlists identity/version metadata and drops names, contact details, URLs and credentials', () => {
  const value = {
    profileId: 'profile-1',
    profileKind: 'cloud',
    profileSubjectId: 'subject-1',
    organizationId: 'organization-1',
    deploymentId: 'deployment-1',
    profileIssuerHash: 'a'.repeat(64),
    accountStatus: 'sign_in_required',
    appVersion: '0.5.0',
    buildNumber: '42',
    jsVersion: '0.5.1-beta.1',
    runtimeVersion: 'runtime-1',
    updateId: 'update-1',
    isEmbeddedLaunch: false,
  };
  expect(
    projectDiagnosticContext({
      ...value,
      accountSubjectId: 'person@example.com',
      updateChannel: 'https://private.example.com',
      name: 'Private Name',
      phone: '+123456789',
      token: 'Bearer secret',
    }),
  ).toEqual(value);
  expect(projectDiagnosticContext({ accountSubjectId: 'sk-secret' })).toBeUndefined();
  expect(
    projectDiagnosticContext({ profileIssuerHash: 'https://issuer.example.com' }),
  ).toBeUndefined();
  expect(projectDiagnosticContext({ accountStatus: 'unverified-value' })).toBeUndefined();
});

test('snapshots mutable readers and isolates context failures from event capture', () => {
  const source = { accountSubjectId: 'first' };
  installDiagnosticContextReader(() => source);
  const first = readDiagnosticContext();
  source.accountSubjectId = 'second';
  expect(first).toEqual({ accountSubjectId: 'first' });
  expect(readDiagnosticContext()).toEqual({ accountSubjectId: 'second' });
  installDiagnosticContextReader(() => {
    throw new Error('unavailable');
  });
  expect(readDiagnosticContext()).toBeUndefined();
});
