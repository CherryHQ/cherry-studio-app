import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, resolve } from 'node:path';

import { sanitizeDiagnostic } from './shared';

// Initial unmeasured policy bounds, not measurements of worker or Sentry performance.
export const HOOK_DEADLINE_MS = 10 * 60_000;
// The watchdog is a backstop. It fires after the in-process deadline can record a pending upload.
export const WATCHDOG_GRACE_MS = 30_000;
export const TOOL_TIMEOUT_MS = 60_000;
export const PACKAGING_TIMEOUT_MS = 120_000;
export const UPLOAD_TIMEOUT_MS = 180_000;
export const VERIFICATION_TIMEOUT_MS = 120_000;
export const MAX_POLL_ROUNDS = 24;
export const UUID_CONCURRENCY = 3;
export const HTTP_TIMEOUT_MS = 10_000;
export const FIRST_POLL_MS = 5_000;
export const MAX_QUERY_PAGES = 10;
export const REQUIRED_IDENTIFIERS = [
  'com.cherryai.cherrystudio-app',
  'com.cherryai.cherrystudio-app.ExpoWidgetsTarget',
  'com.cherryai.cherrystudio-app.CherryShareExtension',
];
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
export const DIF_FEATURES = new Set([
  'debug',
  'symtab',
  'unwind',
  'sources',
  'mapping',
  'minidump',
]);

export class GateError extends Error {
  constructor(
    readonly code: string,
    message: string = code,
  ) {
    super(message);
  }
}

// The local originals are intact. TestFlight remains gated by the downloaded-package verifier.
export class PendingSymbolUpload extends GateError {}

class RetryableError extends GateError {
  constructor(readonly retryAfterMs = FIRST_POLL_MS) {
    super('HTTP_RETRY');
  }
}

export function requireValue(condition: unknown, item: string): asserts condition {
  if (!condition) throw new GateError('PREFLIGHT', `Missing or invalid ${item}`);
}

export function validUuid(value: string): boolean {
  return UUID_PATTERN.test(value) && value.toLowerCase() !== NIL_UUID;
}

export function pairKey(pair: UuidArch) {
  return `${pair.uuid.toLowerCase()}/${pair.arch.toLowerCase()}`;
}

export function jsonFile(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export interface UuidArch {
  uuid: string;
  arch: string;
}

export interface Bundle {
  relPath: string;
  identifier: string;
  executable: string;
  version: string;
  build: string;
  uuids: UuidArch[];
}

export function requiredIosBundles<T extends { identifier: string }>(bundles: readonly T[]): T[] {
  return REQUIRED_IDENTIFIERS.map((id) => {
    const matches = bundles.filter((bundle) => bundle.identifier === id);
    requireValue(matches.length === 1, `IPA bundle ${id}`);
    return matches[0];
  });
}

export interface Dsym {
  relPath: string;
  exePath: string;
  uuids: UuidArch[];
  slices: (UuidArch & { features: string[]; sourceLineBytes: number | null })[];
}

export interface ActiveContext {
  kind: 'active';
  env?: NodeJS.ProcessEnv;
  buildId: string;
  sourceSha: string;
  sentryUrl: string;
  org: string;
  project: string;
  token: string;
  dsnProjectId: string;
  dsn?: string;
  archivePath: string;
  ipaPath: string;
}

export type SentryTarget = Pick<
  ActiveContext,
  'sentryUrl' | 'org' | 'project' | 'token' | 'dsnProjectId' | 'dsn' | 'env'
>;

export type BuildContext = ActiveContext | { kind: 'skip'; reason: string };

export interface CommandResult {
  stdout: string;
  stderr?: string;
  exitCode: number | null;
  signal?: NodeJS.Signals | null;
  timedOut?: boolean;
  spawnError?: string;
}

export type Run = (
  command: string,
  args: string[],
  options?: { timeoutMs?: number; env?: NodeJS.ProcessEnv },
) => Promise<CommandResult>;

export interface Observation extends UuidArch {
  id: string;
  symbolType: string;
  features: string[];
  observedAt: string;
}

/** Documented wire fields from Sentry's project debug-files API. */
export interface RemoteDebugRecord {
  id: string;
  uuid: string;
  debugId: string;
  codeId: string | null;
  cpuName: string;
  objectName: string;
  headers: Record<string, string>;
  size: number;
  sha1: string;
  dateCreated: string;
  symbolType: string;
  data: { features: string[] };
}

const activeChildKills = new Set<() => void>();

export function killActiveChildren() {
  for (const kill of activeChildKills) kill();
}

export const runCommand: Run = (command, args, options) =>
  new Promise((accept) => {
    const env = options?.env ?? process.env;
    const grouped = process.platform !== 'win32';
    const child = spawn(command, args, {
      env,
      detached: grouped,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let spawnError: string | undefined;
    const kill = () => {
      try {
        if (grouped && child.pid) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        /* The process may already have exited. */
      }
    };
    activeChildKills.add(kill);
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, options?.timeoutMs ?? TOOL_TIMEOUT_MS);
    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
      if (stdout.length > 10 * 1024 * 1024) {
        spawnError = 'OUTPUT_LIMIT';
        kill();
      }
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr = (stderr + data.toString()).slice(-16_384);
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      spawnError = error.code ?? 'SPAWN_ERROR';
    });
    child.on('close', (exitCode, signal) => {
      activeChildKills.delete(kill);
      clearTimeout(timer);
      accept({
        stdout,
        stderr: sanitizeDiagnostic(stderr, env),
        exitCode,
        signal,
        timedOut,
        spawnError,
      });
    });
  });

export function commandFailure(
  result: CommandResult,
  command: string,
  env?: Record<string, string | undefined>,
) {
  const code = result.timedOut
    ? 'TOOL_TIMEOUT'
    : result.spawnError
      ? `TOOL_SPAWN_${result.spawnError}`
      : result.signal
        ? `TOOL_SIGNAL_${result.signal}`
        : result.exitCode !== 0
          ? `TOOL_EXIT_${result.exitCode}`
          : undefined;
  return code
    ? new GateError(
        code,
        `Required tool failed: ${basename(command)} (${code}): ${sanitizeDiagnostic(result.stderr ?? '', env)}`,
      )
    : undefined;
}

export async function checked(
  run: Run,
  command: string,
  args: string[],
  timeoutMs = TOOL_TIMEOUT_MS,
) {
  const result = await run(command, args, { timeoutMs });
  const failure = commandFailure(result, command);
  if (failure) throw failure;
  return result.stdout.trim();
}

export function parseDsnProjectId(value: string): string {
  try {
    const dsn = new URL(value);
    const projectId = dsn.pathname.split('/').at(-1)!;
    if (
      dsn.protocol !== 'https:' ||
      !dsn.username ||
      dsn.password ||
      dsn.search ||
      dsn.hash ||
      !/^[0-9]{1,20}$/.test(projectId)
    )
      throw new Error();
    return projectId;
  } catch {
    throw new GateError('SENTRY_DSN_INVALID');
  }
}

export function sentryTargetFromEnv(env: NodeJS.ProcessEnv): SentryTarget {
  requireValue(env.SENTRY_AUTH_TOKEN?.trim(), 'SENTRY_AUTH_TOKEN');
  requireValue(env.EXPO_PUBLIC_SENTRY_DSN?.trim(), 'EXPO_PUBLIC_SENTRY_DSN');
  const plugins = jsonFile(resolve('app.json')).expo.plugins as unknown[];
  const plugin = plugins.find(
    (entry) => Array.isArray(entry) && entry[0] === '@sentry/react-native/expo',
  ) as [string, { url: string; organization: string; project: string }] | undefined;
  requireValue(plugin, 'Sentry Expo plugin');
  const sentryUrl = env.SENTRY_URL ?? plugin[1].url;
  let url: URL;
  try {
    url = new URL(sentryUrl);
  } catch {
    throw new GateError('PREFLIGHT', 'Missing or invalid SENTRY_URL');
  }
  requireValue(
    url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash,
    'SENTRY_URL',
  );
  const org = env.SENTRY_ORG ?? plugin[1].organization;
  const project = env.SENTRY_PROJECT ?? plugin[1].project;
  requireValue(/^[a-z0-9_-]+$/i.test(org), 'Sentry org');
  requireValue(/^[a-z0-9_-]+$/i.test(project), 'Sentry project');
  requireValue(
    org === plugin[1].organization && project === plugin[1].project,
    'Sentry org/project configuration conflict',
  );
  return {
    sentryUrl: url.href.replace(/\/$/, ''),
    org,
    project,
    token: env.SENTRY_AUTH_TOKEN!,
    dsnProjectId: parseDsnProjectId(env.EXPO_PUBLIC_SENTRY_DSN!),
    dsn: env.EXPO_PUBLIC_SENTRY_DSN!,
  };
}

export function sentryTargetFingerprint(ctx: SentryTarget) {
  return createHash('sha256')
    .update(JSON.stringify([ctx.sentryUrl, ctx.org, ctx.project, ctx.dsn]))
    .digest('hex');
}

export function uploadSymbolFiles(
  run: Run,
  cli: string,
  ctx: SentryTarget,
  paths: string[],
  wait: boolean,
  timeoutMs: number,
) {
  return run(
    cli,
    [
      'debug-files',
      'upload',
      '--org',
      ctx.org,
      '--project',
      ctx.project,
      ...(wait ? ['--wait-for', '120'] : []),
      ...paths,
    ],
    { timeoutMs, env: { ...process.env, SENTRY_AUTH_TOKEN: ctx.token, SENTRY_URL: ctx.sentryUrl } },
  );
}

/** Read the pinned CLI's documented features/variants evidence for one native object. */
export async function inspectDsymSlice(run: Run, cli: string, path: string, pair: UuidArch) {
  let info;
  try {
    info = JSON.parse(await checked(run, cli, ['debug-files', 'check', '--json', path]));
  } catch (error) {
    throw new GateError(
      'LOCAL_DEBUG_INSPECTION',
      `Cannot inspect local dSYM ${path}: ${error instanceof GateError ? error.message : 'invalid check JSON'}`,
    );
  }
  if (
    typeof info.features !== 'string' ||
    !Array.isArray(info.variants) ||
    info.variants.length !== 1 ||
    info.variants[0].debug_id?.toLowerCase() !== pair.uuid ||
    info.variants[0].arch?.toLowerCase() !== pair.arch
  )
    throw new GateError(
      'LOCAL_DEBUG_SCHEMA',
      `Invalid local debug evidence: ${path} ${pairKey(pair)}`,
    );
  const features = info.features
    .split(',')
    .map((feature: string) => feature.trim())
    .filter(Boolean);
  if (!features.every((feature: string) => DIF_FEATURES.has(feature)))
    throw new GateError('LOCAL_DEBUG_SCHEMA');
  let sourceLineBytes = 0;
  if (features.includes('debug')) {
    const stats = JSON.parse(await checked(run, 'xcrun', ['dwarfdump', '--statistics', path]));
    sourceLineBytes = stats['#bytes with line information'] - stats['#bytes with line-0 locations'];
    requireValue(
      Number.isSafeInteger(sourceLineBytes) && sourceLineBytes >= 0,
      'DWARF source-line statistics',
    );
  }
  return { features, sourceLineBytes };
}

export function hasQualifyingRecord(records: unknown[], uuid: string, arch: string): boolean {
  return records.some((value) => {
    if (!value || typeof value !== 'object') return false;
    const record = value as Partial<RemoteDebugRecord>;
    return (
      typeof record.id === 'string' &&
      record.id.length > 0 &&
      typeof record.uuid === 'string' &&
      record.uuid.toLowerCase() === uuid.toLowerCase() &&
      typeof record.debugId === 'string' &&
      record.debugId.toLowerCase() === uuid.toLowerCase() &&
      typeof record.cpuName === 'string' &&
      record.cpuName.toLowerCase() === arch.toLowerCase() &&
      record.symbolType === 'macho' &&
      Array.isArray(record.data?.features) &&
      record.data.features.includes('debug')
    );
  });
}

function validateRecords(value: unknown): RemoteDebugRecord[] {
  if (!Array.isArray(value))
    throw new GateError('REMOTE_SCHEMA', 'Expected Sentry debug-files response array');
  for (const record of value) {
    if (
      !record ||
      typeof record.id !== 'string' ||
      !/^[0-9]{1,20}$/.test(record.id) ||
      typeof record.uuid !== 'string' ||
      !validUuid(record.uuid) ||
      typeof record.debugId !== 'string' ||
      !validUuid(record.debugId) ||
      (record.codeId !== null && typeof record.codeId !== 'string') ||
      typeof record.cpuName !== 'string' ||
      !record.cpuName.trim() ||
      typeof record.objectName !== 'string' ||
      record.objectName.length < 1 ||
      record.objectName.length > 255 ||
      /[\x00-\x1f\x7f-\x9f]/.test(record.objectName) ||
      !record.headers ||
      typeof record.headers !== 'object' ||
      Array.isArray(record.headers) ||
      !Object.values(record.headers).every((header) => typeof header === 'string') ||
      !Number.isSafeInteger(record.size) ||
      record.size < 0 ||
      typeof record.sha1 !== 'string' ||
      !/^[0-9a-f]{40}$/.test(record.sha1) ||
      typeof record.dateCreated !== 'string' ||
      !Number.isFinite(Date.parse(record.dateCreated)) ||
      typeof record.symbolType !== 'string' ||
      !record.symbolType.trim() ||
      !Array.isArray(record.data?.features) ||
      !record.data.features.every(
        (feature: unknown) => typeof feature === 'string' && DIF_FEATURES.has(feature),
      )
    )
      throw new GateError('REMOTE_SCHEMA', 'Invalid Sentry debug-files record schema');
  }
  return value;
}

export async function queryDebugFiles({
  ctx,
  uuid,
  fetch: fetchImpl = fetch,
  now = Date.now,
  deadlineMs,
  preflight = false,
  clientKeys = false,
  onIdentityUnverified,
}: {
  ctx: SentryTarget;
  uuid: string;
  fetch?: typeof fetch;
  now?: () => number;
  deadlineMs: number;
  preflight?: boolean;
  clientKeys?: boolean;
  onIdentityUnverified?: (reason: 'project-scope' | 'client-key-scope') => void;
}): Promise<RemoteDebugRecord[]> {
  const endpoint = new URL(
    `${ctx.sentryUrl}/api/0/projects/${ctx.org}/${ctx.project}/${preflight ? (clientKeys ? 'keys/' : '') : 'files/dsyms/'}`,
  );
  if (!preflight) endpoint.searchParams.set('debug_id', uuid);
  let next: URL | undefined = endpoint;
  const visited = new Set<string>();
  const records: RemoteDebugRecord[] = [];
  while (next) {
    if (visited.size >= MAX_QUERY_PAGES || visited.has(next.href))
      throw new GateError('PAGINATION_LIMIT');
    requireValue(
      next.origin === endpoint.origin &&
        next.pathname === endpoint.pathname &&
        !next.username &&
        !next.password &&
        !next.hash &&
        (preflight || next.searchParams.get('debug_id') === uuid) &&
        [...next.searchParams.keys()].every((key) =>
          ['debug_id', 'cursor', 'per_page'].includes(key),
        ),
      'Sentry pagination target',
    );
    visited.add(next.href);
    const timeoutMs = Math.min(HTTP_TIMEOUT_MS, deadlineMs - now());
    if (timeoutMs <= 0) throw new GateError('VERIFICATION_DEADLINE');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let response: Response;
    let body: unknown;
    try {
      await Promise.race([
        (async () => {
          response = await fetchImpl(next!.href, {
            headers: { Authorization: `Bearer ${ctx.token}` },
            redirect: 'manual',
            signal: controller.signal,
          });
          if (response.status === 429 || response.status >= 500) {
            const retry = response.headers.get('Retry-After');
            const seconds =
              retry && /^\d+$/.test(retry)
                ? Number(retry) * 1000
                : retry
                  ? Date.parse(retry) - now()
                  : FIRST_POLL_MS;
            throw new RetryableError(
              Number.isFinite(seconds) ? Math.max(0, seconds) : FIRST_POLL_MS,
            );
          }
          if (preflight && [401, 403, 404].includes(response.status)) return;
          if (!response.ok) throw new GateError(`HTTP_${response.status}`);
          try {
            body = await response.json();
          } catch {
            if (controller.signal.aborted) throw new RetryableError();
            throw new GateError('MALFORMED_JSON');
          }
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new RetryableError());
          }, timeoutMs);
        }),
      ]);
    } catch (error) {
      if (error instanceof GateError) throw error;
      throw new RetryableError();
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
    if (preflight) {
      if ([401, 403, 404].includes(response!.status)) {
        onIdentityUnverified?.(clientKeys ? 'client-key-scope' : 'project-scope');
        return [];
      }
      if (!clientKeys) {
        const id = (body as { id?: unknown } | null)?.id;
        if (typeof id !== 'string' || !/^[0-9]{1,20}$/.test(id))
          throw new GateError('REMOTE_PROJECT_SCHEMA');
        if (id !== ctx.dsnProjectId) throw new GateError('SENTRY_DSN_PROJECT_MISMATCH');
        return queryDebugFiles({
          ctx,
          uuid,
          fetch: fetchImpl,
          now,
          deadlineMs,
          preflight: true,
          clientKeys: true,
          onIdentityUnverified,
        });
      }
      if (!Array.isArray(body)) throw new GateError('REMOTE_CLIENT_KEY_SCHEMA');
      const dsnValue = ctx.dsn ?? ctx.env?.EXPO_PUBLIC_SENTRY_DSN;
      if (!dsnValue) throw new GateError('SENTRY_DSN_MISSING');
      const dsn = new URL(dsnValue);
      for (const row of body) {
        if (typeof row?.isActive !== 'boolean' || typeof row?.dsn?.public !== 'string')
          throw new GateError('REMOTE_CLIENT_KEY_SCHEMA');
        let candidate: URL;
        try {
          parseDsnProjectId(row.dsn.public);
          candidate = new URL(row.dsn.public);
        } catch {
          throw new GateError('REMOTE_CLIENT_KEY_SCHEMA');
        }
        if (
          row.isActive &&
          candidate.username === dsn.username &&
          candidate.host === dsn.host &&
          candidate.pathname === dsn.pathname &&
          candidate.protocol === dsn.protocol
        )
          return [];
      }
    } else {
      records.push(...validateRecords(body));
    }
    const link = response!.headers.get('Link');
    next = undefined;
    if (link) {
      for (const part of link.split(/,(?=\s*<)/)) {
        if (!/rel="next"/.test(part) || /results="false"/.test(part)) continue;
        const target = /^\s*<([^>]+)>/.exec(part);
        requireValue(target, 'Sentry pagination Link');
        try {
          next = new URL(target[1], endpoint);
        } catch {
          throw new GateError('PAGINATION_TARGET');
        }
      }
    }
  }
  if (clientKeys) throw new GateError('SENTRY_DSN_KEY_MISMATCH');
  return records;
}

export async function retryPreflight({
  query,
  deadlineMs,
  now = Date.now,
  sleep = (ms) => new Promise((accept) => setTimeout(accept, ms)),
}: {
  query: () => Promise<unknown>;
  deadlineMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<unknown>;
}) {
  for (let round = 0; round < MAX_POLL_ROUNDS && now() < deadlineMs; round++) {
    try {
      await query();
      return;
    } catch (error) {
      if (!(error instanceof RetryableError)) throw error;
      if (round + 1 < MAX_POLL_ROUNDS)
        await sleep(
          Math.min(Math.max(FIRST_POLL_MS, error.retryAfterMs), Math.max(0, deadlineMs - now())),
        );
    }
  }
  throw new GateError(
    'PREFLIGHT_DEADLINE',
    'Authenticated Sentry preflight did not complete before deadline',
  );
}

export async function waitForRemoteDebug({
  uuids,
  fetchRecords,
  now = Date.now,
  sleep = (ms) => new Promise((accept) => setTimeout(accept, ms)),
  deadlineMs,
  onVerified,
}: {
  uuids: UuidArch[];
  fetchRecords: (uuid: string) => Promise<RemoteDebugRecord[]>;
  now?: () => number;
  sleep?: (ms: number) => Promise<unknown>;
  deadlineMs: number;
  onVerified?: (record: Observation) => void;
}): Promise<Observation[]> {
  const pending = new Map(uuids.map((pair) => [pairKey(pair), pair]));
  const observations: Observation[] = [];
  await sleep(Math.min(FIRST_POLL_MS, Math.max(0, deadlineMs - now())));
  for (let round = 0; round < MAX_POLL_ROUNDS && now() < deadlineMs; round++) {
    let retryAfterMs = FIRST_POLL_MS;
    const ids = [...new Set([...pending.values()].map((pair) => pair.uuid))];
    for (let start = 0; start < ids.length && now() < deadlineMs; start += UUID_CONCURRENCY) {
      await Promise.all(
        ids.slice(start, start + UUID_CONCURRENCY).map(async (uuid) => {
          let rows: RemoteDebugRecord[];
          try {
            rows = validateRecords(await fetchRecords(uuid));
          } catch (error) {
            if (!(error instanceof RetryableError)) throw error;
            retryAfterMs = Math.max(retryAfterMs, error.retryAfterMs);
            return;
          }
          if (now() >= deadlineMs) return;
          for (const [key, pair] of pending) {
            if (pair.uuid !== uuid || !hasQualifyingRecord(rows, pair.uuid, pair.arch)) continue;
            const row = rows.find((row) => hasQualifyingRecord([row], pair.uuid, pair.arch))!;
            const record = {
              ...pair,
              id: row.id,
              symbolType: row.symbolType,
              features: row.data.features,
              observedAt: new Date(now()).toISOString(),
            };
            pending.delete(key);
            observations.push(record);
            onVerified?.(record);
          }
        }),
      );
    }
    if (!pending.size) return observations;
    if (round + 1 < MAX_POLL_ROUNDS)
      await sleep(Math.min(retryAfterMs, Math.max(0, deadlineMs - now())));
  }
  throw new GateError(
    'REMOTE_DEBUG_MISSING',
    'Remote full-debug coverage not verified before deadline',
  );
}

export function resolveSentryCli(): string {
  const projectRequire = createRequire(resolve('package.json'));
  const sentryRequire = createRequire(projectRequire.resolve('@sentry/react-native/package.json'));
  // Invoke the native binary directly: the JS wrapper maps a signalled child to exit 0.
  return (
    sentryRequire('@sentry/cli') as { SentryCli: { getPath: () => string } }
  ).SentryCli.getPath();
}
