import { createHash } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';

export const TAG_RE = /^v([0-9]+\.[0-9]+\.[0-9]+)(?:-([0-9A-Za-z.-]+))?$/;
export const SHA_RE = /^[a-f0-9]{40}$/i;

function addUrlCredentialCandidates(candidates: Set<string>, rawValue: string, minLength: number) {
  try {
    const parsed = new URL(rawValue);
    for (const credential of [parsed.username, parsed.password]) {
      for (const part of [credential, decodeURIComponent(credential)]) {
        if (part && part.length >= minLength) {
          candidates.add(part);
        }
      }
    }
  } catch {
    // Non-URL secret or invalid DSN; handled elsewhere without echoing raw values.
  }
}

function collectRedactionCandidates(
  secrets: Iterable<string>,
  env: Record<string, string | undefined>,
  minEnvironmentSecretLength: number,
): string[] {
  const candidates = new Set<string>();
  const addSecret = (value: string, minLength: number) => {
    if (!value || value.length < minLength) return;
    candidates.add(value);
    addUrlCredentialCandidates(candidates, value, minLength);
  };

  for (const secret of secrets) {
    addSecret(secret, 4);
  }
  for (const [key, value] of Object.entries(env)) {
    if (value && /token|secret|password|dsn/i.test(key)) {
      addSecret(value, /dsn/i.test(key) ? 1 : minEnvironmentSecretLength);
    }
  }

  // Mask longest values first so full URLs/DSNs redact before component secrets.
  return [...candidates].sort((a, b) => b.length - a.length);
}

function redactKnownSecrets(
  text: string,
  secrets: Iterable<string>,
  env: Record<string, string | undefined>,
  minEnvironmentSecretLength: number,
): string {
  let redacted = text;
  for (const value of collectRedactionCandidates(secrets, env, minEnvironmentSecretLength)) {
    redacted = redacted.split(value).join('[redacted]');
  }
  return (
    redacted
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      // The fallback includes escaped or incomplete quotes in raw server diagnostics.
      .replace(
        /\b(key|token|sig|signature|X-Amz-[a-z0-9-]+)=(?:"[^"\s]*"|'[^'\s]*'|[^\s&#]*)/gi,
        '$1=[redacted]',
      )
      .replace(/(?:sntrys_|sntryu_)[a-zA-Z0-9_]+/g, '[redacted]')
  );
}

export function redactSecretsInStream(
  text: string,
  secrets: Iterable<string> = [],
  env: Record<string, string | undefined> = process.env,
): string {
  return redactKnownSecrets(text, secrets, env, 4);
}

export function sanitizeDiagnostic(
  text: string,
  env: Record<string, string | undefined> = process.env,
  secrets: Iterable<string> = [],
): string {
  return redactKnownSecrets(text, secrets, env, 1)
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s]+/gi, '[url redacted]')
    .replace(/[a-z][a-z0-9+.-]*:\/[^\s?]*\?[^\s]*/gi, '[url redacted]')
    .replace(/[a-f0-9]{32,}/gi, '[redacted]')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .slice(-2000);
}

export function sanitizeSecrets(
  text: string,
  secrets: Iterable<string> = [],
  env: Record<string, string | undefined> = process.env,
): string {
  return sanitizeDiagnostic(text, env, secrets);
}

export function assertNoSecretLeak(text: string, secrets: Iterable<string>) {
  for (const secret of secrets) {
    if (secret && secret.length >= 4 && text.includes(secret)) {
      throw new Error('Refusing to persist manifest containing secret material.');
    }
  }
}

export function parseReleaseTag(tag: string): {
  tag: string;
  releaseVersion: string;
  baseVersion: string;
  isPrerelease: boolean;
} {
  const match = TAG_RE.exec(tag);
  if (!match) {
    throw new Error(`Invalid release tag: ${tag}. Expected v<major>.<minor>.<patch>[-prerelease].`);
  }
  return {
    tag,
    releaseVersion: tag.slice(1),
    baseVersion: match[1]!,
    isPrerelease: Boolean(match[2]),
  };
}

export async function fileEvidence(
  filePath: string,
  checkDeadline: () => void = () => {},
): Promise<{ size: number; sha256: string }> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    checkDeadline();
    hash.update(chunk);
  }
  checkDeadline();
  return { size: statSync(filePath).size, sha256: hash.digest('hex') };
}
