import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  assertNoSecretLeak,
  fileEvidence,
  parseReleaseTag,
  redactSecretsInStream,
  sanitizeDiagnostic,
  sanitizeReleaseResult,
  sanitizeSecrets,
} from '../release/shared';

describe('release shared helpers', () => {
  it('applies longest-first redaction, URL credentials, and quoted query secrets consistently', () => {
    const token = 'secret-token-part';
    const dsn = `https://${token}@ingest.example/42`;
    const quoted = 'quoted-param-secret';
    const sample = `dsn=${dsn} raw=${token} Bearer bearer-value ?token="${quoted}" sntrys_abc123_XYZ`;
    const env = { EXPO_PUBLIC_SENTRY_DSN: dsn };

    const streamRedacted = redactSecretsInStream(sample, [dsn], env);
    expect(streamRedacted).toBe(
      'dsn=[redacted] raw=[redacted] Bearer [redacted] ?token=[redacted] [redacted]',
    );

    const diagnostic = sanitizeDiagnostic(sample, env, [dsn]);
    expect(diagnostic).toBe(
      'dsn=[redacted] raw=[redacted] Bearer [redacted] ?token=[redacted] [redacted]',
    );

    const sanitized = sanitizeSecrets(sample, [dsn], env);
    expect(sanitized).toBe(diagnostic);
  });

  it('preserves 40-char commit SHAs in stream redaction while redacting 32+ hex in diagnostics', () => {
    const sha = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
    expect(redactSecretsInStream(`commit=${sha}`, [], {})).toBe(`commit=${sha}`);
    expect(sanitizeDiagnostic(`commit=${sha}`, {}, [])).toBe('commit=[redacted]');
    expect(sanitizeSecrets(`commit=${sha}`, [], {})).toBe('commit=[redacted]');
  });

  it('redacts quoted credentials in JSON diagnostics', () => {
    const credential = 'example-signing-value';
    const detail = JSON.stringify({ message: 'Request rejected for key="' + credential + '"' });

    const diagnostic = sanitizeDiagnostic(detail, {});
    expect(diagnostic).toContain('key=[redacted]');
    expect(diagnostic).not.toContain(credential);
  });

  it('redacts short environment secrets from saved diagnostics', () => {
    const env = { CHERRYAI_CLIENT_SECRET: 'q7!' };
    const message = 'Submission declined: q7!';

    expect(sanitizeDiagnostic(message, env)).toBe('Submission declined: [redacted]');
    expect(redactSecretsInStream(message, [], env)).toBe(message);
  });

  it('parses release tags and computes fileEvidence', async () => {
    expect(parseReleaseTag('v0.6.3')).toEqual({
      tag: 'v0.6.3',
      releaseVersion: '0.6.3',
      baseVersion: '0.6.3',
      isPrerelease: false,
    });
    expect(parseReleaseTag('v0.6.3-rc.1')).toEqual({
      tag: 'v0.6.3-rc.1',
      releaseVersion: '0.6.3-rc.1',
      baseVersion: '0.6.3',
      isPrerelease: true,
    });

    const dir = mkdtempSync(join(tmpdir(), 'release-shared-test-'));
    try {
      const target = join(dir, 'sample.txt');
      writeFileSync(target, 'hello');
      const evidence = await fileEvidence(target);
      expect(evidence.size).toBe(5);
      expect(evidence.sha256).toHaveLength(64);
      expect(() => assertNoSecretLeak('clean output', ['super-secret-token'])).not.toThrow();
      expect(() => assertNoSecretLeak('oops super-secret-token', ['super-secret-token'])).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps release script imports acyclic across upload/verify/publish modules', () => {
    const root = resolve(__dirname, '..');
    const verifySrc = readFileSync(join(root, 'verifyIosSymbolPackage.ts'), 'utf8');
    const publishSrc = readFileSync(join(root, 'publishRelease.ts'), 'utf8');
    const gitcodeSrc = readFileSync(join(root, 'publishGitcodeRelease.ts'), 'utf8');
    const localBuildSrc = readFileSync(join(root, 'releaseLocalBuild.ts'), 'utf8');

    expect(verifySrc).not.toMatch(/uploadIosSymbols/);
    expect(publishSrc).not.toMatch(/releaseLocalBuild/);
    expect(gitcodeSrc).not.toMatch(/releaseLocalBuild/);
    expect(localBuildSrc).not.toMatch(/uploadIosSymbols/);
  });
});

it('keeps recovery JSON complete and SHA-256 integrity while redacting nested diagnostics', () => {
  const sha256 = 'abcd'.repeat(16);
  const value = {
    sha256,
    archiveDir: '/srv/releases/ios',
    symbolVerification: {
      manifestSha256: sha256,
      records: Array.from({ length: 200 }, (_, id) => ({ id, sha256 })),
      message: 'token=secret-value ' + 'x'.repeat(3000),
    },
    receipt: { message: 'token=another-secret' },
  };
  const output = JSON.stringify(sanitizeReleaseResult(value, {}), null, 2);
  const parsed = JSON.parse(output);
  expect(output.length).toBeGreaterThan(2000);
  expect(parsed.sha256).toBe(sha256);
  expect(parsed.symbolVerification.manifestSha256).toBe(sha256);
  expect(parsed.symbolVerification.records).toHaveLength(200);
  expect(output).not.toContain('secret-value');
  expect(output).not.toContain('another-secret');
  expect(parsed.symbolVerification.message.length).toBeLessThanOrEqual(2000);
});
