import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, openAsBlob, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { fileEvidence, parseReleaseTag, sanitizeSecrets } from './releaseLocalBuild';

const SHA_RE = /^[a-f0-9]{40}$/i;
const DEFAULT_API_URL = 'https://api.gitcode.com/api/v5';
const DEFAULT_OWNER = 'CherryHQ';
const DEFAULT_REPO = 'cherry-studio-app';
const UPLOAD_ATTEMPTS = 3;
const VERIFY_ATTEMPTS = 6;
const UPLOAD_RETRY_DELAY_MS = 3_000;
const VERIFY_POLL_DELAY_MS = 5_000;

interface GitcodeAsset {
  name?: string;
  type?: string;
  browser_download_url?: string;
}

interface GitcodeRelease {
  tag_name?: string;
  name?: string;
  body?: string | null;
  release_status?: string;
  assets?: GitcodeAsset[] | null;
}

interface GitcodeUploadUrlResponse {
  url?: string;
  headers?: Record<string, string>;
}

interface GitcodeConnectionOptions {
  tag: string;
  releaseName?: string;
  apiUrl?: string;
  owner?: string;
  repo?: string;
  token?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export interface StageGitcodeReleaseOptions extends GitcodeConnectionOptions {
  commitSha: string;
  archiveDir: string;
  artifactName: string;
  buildId?: string;
  nativeBuildVersion?: string;
  sleep?: (ms: number) => Promise<void>;
  createFileBody?: (filePath: string) => Promise<BodyInit>;
}

export interface StageGitcodeReleaseResult {
  releaseUrl: string;
  tag: string;
  releaseStatus: 'pre' | 'latest';
  created: boolean;
  patched: boolean;
  uploaded: string[];
  skipped: string[];
  hashes: Record<string, string>;
}

export interface PublishGitcodeReleaseOptions extends GitcodeConnectionOptions {
  notesText: string;
  artifactName?: string;
}

export interface PublishGitcodeReleaseResult {
  releaseUrl: string;
  tag: string;
  releaseStatus: 'pre' | 'latest';
  promotedToLatest: boolean;
  verifiedAssets: string[];
}

const STABLE_VERSION_RE = /^v?(\d+\.\d+\.\d+)$/;

function compareStableVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index++) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function extractCommitSha(payload: {
  sha?: string;
  id?: string;
  commit?: { sha?: string; id?: string };
}): string | null {
  const raw = payload.sha ?? payload.id ?? payload.commit?.sha ?? payload.commit?.id;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  return SHA_RE.test(trimmed) ? trimmed : null;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolvePromise) => setTimeout(resolvePromise, ms));

const defaultCreateFileBody = async (filePath: string): Promise<BodyInit> => openAsBlob(filePath);

function isAttachmentAsset(asset: GitcodeAsset): boolean {
  return asset.type === undefined || asset.type === 'attach';
}

export function parseChecksumForArtifact(checksumText: string, artifactName: string): string {
  const matches: string[] = [];
  for (const line of checksumText.split(/\r?\n/)) {
    const match = /^([a-fA-F0-9]{64}) [ *](\S+)$/.exec(line);
    if (match?.[2] === artifactName) {
      matches.push(match[1]!.toLowerCase());
    }
  }
  if (matches.length !== 1) {
    throw new Error(`Missing or ambiguous SHA256SUMS entry for ${artifactName}.`);
  }
  return matches[0]!;
}

export function buildStagingGitcodeNotes({
  releaseVersion,
  tag,
  commitSha,
  buildId,
  nativeBuildVersion,
  artifactName,
  artifactSha256,
}: {
  releaseVersion: string;
  tag: string;
  commitSha: string;
  buildId?: string;
  nativeBuildVersion?: string;
  artifactName: string;
  artifactSha256: string;
}): string {
  const lines = [
    `# Cherry Studio ${releaseVersion}`,
    '',
    `版本 \`${tag}\` 的 Android 公开安装包已由构建机预传并完成校验，待维护者补充正式发布说明后公开。`,
    '',
    '## 下载安装',
    '',
    `- Android：附件 \`${artifactName}\`（ARM64）与校验文件 \`SHA256SUMS\` 已预传。`,
    '- Google Play 与 iOS App Store 的上架进度取决于各自审核流程，与本页面安装包相互独立。',
    '',
    `Source: ${commitSha}`,
  ];
  if (buildId) {
    lines.push(`Local build ID: ${buildId}`);
  }
  if (nativeBuildVersion) {
    lines.push(`Native versionCode: ${nativeBuildVersion}`);
  }
  lines.push(`SHA-256 (${artifactName}): ${artifactSha256}`);
  return `${lines.join('\n')}\n`;
}

export async function verifyArchivedApk(
  archiveDir: string,
  artifactName: string,
): Promise<{
  artifactPath: string;
  checksumPath: string;
  hashes: Record<string, string>;
}> {
  const resolvedDir = resolve(archiveDir);
  const artifactPath = join(resolvedDir, artifactName);
  const checksumPath = join(resolvedDir, 'SHA256SUMS');

  if (!existsSync(artifactPath) || !statSync(artifactPath).isFile()) {
    throw new Error(`Archived APK does not exist: ${artifactPath}`);
  }
  if (!existsSync(checksumPath) || !statSync(checksumPath).isFile()) {
    throw new Error(`Archived SHA256SUMS does not exist: ${checksumPath}`);
  }

  const apkEvidence = await fileEvidence(artifactPath);
  const checksumEvidence = await fileEvidence(checksumPath);
  const expectedSha256 = parseChecksumForArtifact(readFileSync(checksumPath, 'utf8'), artifactName);

  if (expectedSha256 !== apkEvidence.sha256) {
    throw new Error(
      `SHA256SUMS mismatch for ${artifactName}: expected ${expectedSha256}, got ${apkEvidence.sha256}.`,
    );
  }

  return {
    artifactPath,
    checksumPath,
    hashes: {
      [artifactName]: apkEvidence.sha256,
      SHA256SUMS: checksumEvidence.sha256,
    },
  };
}

async function readResponseSha256(response: Response): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  return createHash('sha256').update(bytes).digest('hex');
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return (await response.text()).trim();
  } catch {
    return '';
  }
}

async function fetchGitcodeAttachment(
  ctx: ReturnType<typeof resolveGitcodeContext>,
  assetUrl: string,
  description: string,
): Promise<Response> {
  const downloadOrigin = new URL(assetUrl).origin;
  const response = await ctx.fetchImpl(assetUrl, {
    method: 'GET',
    headers:
      downloadOrigin === ctx.apiOrigin ? { Authorization: `Bearer ${ctx.token}` } : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const detail = ctx.sanitize(await readErrorBody(response));
    throw new Error(
      `Failed to fetch ${description} (${response.status})${detail ? `: ${detail}` : ''}`,
    );
  }
  return response;
}

function resolveGitcodeContext(options: GitcodeConnectionOptions) {
  const env = options.env ?? process.env;
  const parsedTag = parseReleaseTag(options.tag);
  const token = (options.token ?? env.GITCODE_TOKEN ?? '').trim();
  if (!token) {
    throw new Error('Missing required GITCODE_TOKEN environment variable.');
  }

  const secretValues = [
    token,
    env.GH_TOKEN ?? '',
    env.GITHUB_TOKEN ?? '',
    env.EXPO_TOKEN ?? '',
    env.SENTRY_AUTH_TOKEN ?? '',
  ].filter(Boolean);

  const sanitize = (text: string) => sanitizeSecrets(text, secretValues, env);
  const apiUrl = (options.apiUrl?.trim() || env.GITCODE_API_URL?.trim() || DEFAULT_API_URL).replace(
    /\/+$/,
    '',
  );
  const owner = options.owner?.trim() || env.GITCODE_OWNER?.trim() || DEFAULT_OWNER;
  const repo = options.repo?.trim() || env.GITCODE_REPO?.trim() || DEFAULT_REPO;
  const fetchImpl = options.fetchImpl ?? fetch;
  const releaseName = options.releaseName?.trim() || parsedTag.tag;
  const repoBaseUrl = `${apiUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const releasesBaseUrl = `${repoBaseUrl}/releases`;
  const tagReleaseUrl = `${releasesBaseUrl}/tags/${encodeURIComponent(parsedTag.tag)}`;
  const apiOrigin = new URL(apiUrl).origin;
  const webBaseUrl = apiOrigin.replace(/^https?:\/\/api\./, 'https://');
  const releaseUrl = `${webBaseUrl}/${owner}/${repo}/releases/tag/${parsedTag.tag}`;
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };

  return {
    parsedTag,
    token,
    sanitize,
    apiOrigin,
    fetchImpl,
    releaseName,
    repoBaseUrl,
    releasesBaseUrl,
    tagReleaseUrl,
    releaseUrl,
    authHeaders,
  };
}

/**
 * Stages the archived public APK and SHA256SUMS as a pre-release on GitCode without promoting to
 * `latest`. An already-latest release keeps its status and curated body on retry.
 */
export async function stageGitcodeRelease(
  options: StageGitcodeReleaseOptions,
): Promise<StageGitcodeReleaseResult> {
  if (!SHA_RE.test(options.commitSha)) {
    throw new Error(`Invalid commit SHA: ${options.commitSha}`);
  }
  const commitSha = options.commitSha.toLowerCase();
  const ctx = resolveGitcodeContext(options);
  const sleep = options.sleep ?? defaultSleep;
  const createFileBody = options.createFileBody ?? defaultCreateFileBody;

  // Validate archived files and SHA256SUMS locally before touching the remote API.
  const verified = await verifyArchivedApk(options.archiveDir, options.artifactName);
  const stagingBody = buildStagingGitcodeNotes({
    releaseVersion: ctx.parsedTag.releaseVersion,
    tag: ctx.parsedTag.tag,
    commitSha,
    buildId: options.buildId,
    nativeBuildVersion: options.nativeBuildVersion,
    artifactName: options.artifactName,
    artifactSha256: verified.hashes[options.artifactName]!,
  });

  // Verify any existing remote tag points to the expected source commit before mutating a release.
  let remoteTagVerified = false;
  const tagCommitResponse = await ctx.fetchImpl(
    `${ctx.repoBaseUrl}/commits/${encodeURIComponent(ctx.parsedTag.tag)}`,
    {
      method: 'GET',
      headers: ctx.authHeaders,
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (tagCommitResponse.status === 200) {
    const commitPayload = (await tagCommitResponse.json()) as {
      sha?: string;
      id?: string;
      commit?: { sha?: string; id?: string };
    };
    const remoteTagSha = extractCommitSha(commitPayload);
    if (!remoteTagSha) {
      throw new Error(
        `GitCode tag ${ctx.parsedTag.tag} commit lookup did not return a valid SHA; refusing to stage.`,
      );
    }
    if (remoteTagSha !== commitSha) {
      throw new Error(
        `GitCode tag ${ctx.parsedTag.tag} points to commit ${remoteTagSha}, expected ${commitSha}. Sync the GitCode mirror before re-running stage-gitcode.`,
      );
    }
    remoteTagVerified = true;
  } else if (tagCommitResponse.status !== 404) {
    const detail = ctx.sanitize(await readErrorBody(tagCommitResponse));
    throw new Error(
      `Failed to verify GitCode tag ${ctx.parsedTag.tag} commit (${tagCommitResponse.status})${detail ? `: ${detail}` : ''}`,
    );
  }

  let created = false;
  let patched = false;
  let existingAssets: GitcodeAsset[] = [];
  let currentRemoteStatus: string | undefined;

  const getResponse = await ctx.fetchImpl(ctx.tagReleaseUrl, {
    method: 'GET',
    headers: ctx.authHeaders,
    signal: AbortSignal.timeout(60_000),
  });

  if (getResponse.status === 200) {
    if (!remoteTagVerified) {
      throw new Error(
        `Existing GitCode release ${ctx.parsedTag.tag} could not be verified against commit ${commitSha}. Sync the GitCode mirror before re-running stage-gitcode.`,
      );
    }
    const existing = (await getResponse.json()) as GitcodeRelease;
    existingAssets = Array.isArray(existing.assets) ? existing.assets : [];
    currentRemoteStatus = existing.release_status;

    if (!existing.body?.trim()) {
      const metadataStatus = currentRemoteStatus === 'latest' ? 'latest' : 'pre';
      const patchResponse = await ctx.fetchImpl(
        `${ctx.releasesBaseUrl}/${encodeURIComponent(ctx.parsedTag.tag)}`,
        {
          method: 'PATCH',
          headers: {
            ...ctx.authHeaders,
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({
            name: ctx.releaseName,
            body: stagingBody,
            release_status: metadataStatus,
          }),
          signal: AbortSignal.timeout(60_000),
        },
      );
      if (!patchResponse.ok) {
        const detail = ctx.sanitize(await readErrorBody(patchResponse));
        throw new Error(
          `Failed to update GitCode release ${ctx.parsedTag.tag} (${patchResponse.status})${detail ? `: ${detail}` : ''}`,
        );
      }
      currentRemoteStatus = metadataStatus;
      patched = true;
    }
  } else if (getResponse.status === 404) {
    const createResponse = await ctx.fetchImpl(ctx.releasesBaseUrl, {
      method: 'POST',
      headers: {
        ...ctx.authHeaders,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        tag_name: ctx.parsedTag.tag,
        name: ctx.releaseName,
        body: stagingBody,
        target_commitish: commitSha,
        release_status: 'pre',
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!createResponse.ok) {
      const detail = ctx.sanitize(await readErrorBody(createResponse));
      const mirrorHint =
        createResponse.status >= 400 && createResponse.status < 500
          ? ` If the GitCode mirror has not synced commit ${commitSha} yet, sync the mirror and re-run stage-gitcode.`
          : '';
      throw new Error(
        `Failed to create staged GitCode release ${ctx.parsedTag.tag} (${createResponse.status}).${mirrorHint}${detail ? ` Detail: ${detail}` : ''}`,
      );
    }
    created = true;
    currentRemoteStatus = 'pre';
  } else {
    const detail = ctx.sanitize(await readErrorBody(getResponse));
    throw new Error(
      `Failed to query GitCode release ${ctx.parsedTag.tag} (${getResponse.status})${detail ? `: ${detail}` : ''}`,
    );
  }

  // Upload the APK before SHA256SUMS so update clients never resolve checksums without the binary.
  const filesToPublish = [
    { name: options.artifactName, path: verified.artifactPath },
    { name: 'SHA256SUMS', path: verified.checksumPath },
  ];

  const uploaded: string[] = [];
  const skipped: string[] = [];

  for (const file of filesToPublish) {
    const expectedSha256 = verified.hashes[file.name]!;
    const existingAsset = existingAssets.find(
      (asset) => asset.name === file.name && isAttachmentAsset(asset),
    );

    if (existingAsset) {
      if (!existingAsset.browser_download_url) {
        throw new Error(
          `Existing GitCode attachment ${file.name} is missing browser_download_url; refusing overwrite.`,
        );
      }
      const downloadResponse = await fetchGitcodeAttachment(
        ctx,
        existingAsset.browser_download_url,
        `existing GitCode attachment ${file.name}`,
      );
      const remoteSha256 = await readResponseSha256(downloadResponse);
      if (remoteSha256 !== expectedSha256) {
        throw new Error(
          `Existing GitCode attachment ${file.name} checksum mismatch (remote ${remoteSha256} !== local ${expectedSha256}); refusing overwrite.`,
        );
      }
      skipped.push(file.name);
      continue;
    }

    let uploadSucceeded = false;
    let lastErrorMessage = '';

    for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
      try {
        const uploadUrlEndpoint = `${ctx.releasesBaseUrl}/${encodeURIComponent(ctx.parsedTag.tag)}/upload_url?file_name=${encodeURIComponent(file.name)}`;
        const urlResponse = await ctx.fetchImpl(uploadUrlEndpoint, {
          method: 'GET',
          headers: ctx.authHeaders,
          signal: AbortSignal.timeout(60_000),
        });
        if (!urlResponse.ok) {
          const detail = ctx.sanitize(await readErrorBody(urlResponse));
          throw new Error(
            `upload_url returned ${urlResponse.status}${detail ? `: ${detail}` : ''}`,
          );
        }
        const uploadInfo = (await urlResponse.json()) as GitcodeUploadUrlResponse;
        if (!uploadInfo.url) {
          throw new Error(`upload_url response for ${file.name} did not include url.`);
        }

        const putResponse = await ctx.fetchImpl(uploadInfo.url, {
          method: 'PUT',
          headers: uploadInfo.headers ?? {},
          body: await createFileBody(file.path),
          signal: AbortSignal.timeout(3_600_000),
        });
        if (!putResponse.ok) {
          const detail = ctx.sanitize(await readErrorBody(putResponse));
          throw new Error(
            `attachment PUT returned ${putResponse.status}${detail ? `: ${detail}` : ''}`,
          );
        }

        uploadSucceeded = true;
        break;
      } catch (error) {
        lastErrorMessage = ctx.sanitize(error instanceof Error ? error.message : String(error));
        if (attempt < UPLOAD_ATTEMPTS) {
          await sleep(UPLOAD_RETRY_DELAY_MS);
        }
      }
    }

    if (!uploadSucceeded) {
      throw new Error(
        `Failed to upload ${file.name} to GitCode release ${ctx.parsedTag.tag} after ${UPLOAD_ATTEMPTS} attempts: ${lastErrorMessage}`,
      );
    }
    uploaded.push(file.name);
  }

  if (uploaded.length > 0) {
    let verifiedRemote = false;
    for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt++) {
      const checkResponse = await ctx.fetchImpl(ctx.tagReleaseUrl, {
        method: 'GET',
        headers: ctx.authHeaders,
        signal: AbortSignal.timeout(30_000),
      });
      if (checkResponse.ok) {
        const remote = (await checkResponse.json()) as GitcodeRelease;
        const remoteAssets = Array.isArray(remote.assets) ? remote.assets : [];
        const hasAll = filesToPublish.every((file) =>
          remoteAssets.some((asset) => asset.name === file.name && isAttachmentAsset(asset)),
        );
        if (hasAll) {
          verifiedRemote = true;
          break;
        }
      }
      if (attempt < VERIFY_ATTEMPTS) {
        await sleep(VERIFY_POLL_DELAY_MS);
      }
    }
    if (!verifiedRemote) {
      throw new Error(
        `GitCode release ${ctx.parsedTag.tag} did not list all expected attachments after upload.`,
      );
    }
  }

  return {
    releaseUrl: ctx.releaseUrl,
    tag: ctx.parsedTag.tag,
    releaseStatus: currentRemoteStatus === 'latest' ? 'latest' : 'pre',
    created,
    patched,
    uploaded,
    skipped,
    hashes: verified.hashes,
  };
}

/**
 * Publishes an already-staged GitCode release by verifying both attachments and `SHA256SUMS`,
 * applying the prepared Chinese release notes, and promoting eligible stable tags to `latest`.
 */
export async function publishGitcodeRelease(
  options: PublishGitcodeReleaseOptions,
): Promise<PublishGitcodeReleaseResult> {
  const parsedTag = parseReleaseTag(options.tag);
  if (!options.notesText.trim()) throw new Error('GitCode release notes are empty.');
  const ctx = resolveGitcodeContext(options);
  const artifactName =
    options.artifactName?.trim() || `cherry-studio-${parsedTag.releaseVersion}-android.apk`;

  const getResponse = await ctx.fetchImpl(ctx.tagReleaseUrl, {
    method: 'GET',
    headers: ctx.authHeaders,
    signal: AbortSignal.timeout(60_000),
  });
  if (getResponse.status === 404) {
    throw new Error(
      `Staged GitCode release ${parsedTag.tag} does not exist. Run the Release tag workflow to stage artifacts before publishing.`,
    );
  }
  if (!getResponse.ok) {
    const detail = ctx.sanitize(await readErrorBody(getResponse));
    throw new Error(
      `Failed to query GitCode release ${parsedTag.tag} (${getResponse.status})${detail ? `: ${detail}` : ''}`,
    );
  }

  const existing = (await getResponse.json()) as GitcodeRelease;
  const existingAssets = Array.isArray(existing.assets) ? existing.assets : [];
  const requiredAssetNames = [artifactName, 'SHA256SUMS'];
  const assetByName = new Map<string, GitcodeAsset>();

  for (const requiredName of requiredAssetNames) {
    const found = existingAssets.find(
      (asset) => asset.name === requiredName && isAttachmentAsset(asset),
    );
    if (!found) {
      throw new Error(
        `Staged GitCode release ${parsedTag.tag} is missing required attachment ${requiredName}.`,
      );
    }
    if (!found.browser_download_url) {
      throw new Error(`Staged GitCode attachment ${requiredName} is missing browser_download_url.`);
    }
    assetByName.set(requiredName, found);
  }

  const checksumResponse = await fetchGitcodeAttachment(
    ctx,
    assetByName.get('SHA256SUMS')!.browser_download_url!,
    'staged GitCode SHA256SUMS',
  );
  parseChecksumForArtifact(await checksumResponse.text(), artifactName);

  let targetStatus: 'pre' | 'latest' = 'pre';
  let promotedToLatest = false;

  if (!parsedTag.isPrerelease) {
    if (existing.release_status === 'latest') {
      targetStatus = 'latest';
    } else {
      let shouldPromote = true;
      const latestResponse = await ctx.fetchImpl(`${ctx.releasesBaseUrl}/latest?type=latest`, {
        method: 'GET',
        headers: ctx.authHeaders,
        signal: AbortSignal.timeout(30_000),
      });
      if (latestResponse.status === 200) {
        const latestRelease = (await latestResponse.json()) as GitcodeRelease;
        const latestMatch = STABLE_VERSION_RE.exec(latestRelease.tag_name?.trim() ?? '');
        if (latestMatch?.[1] && compareStableVersions(latestMatch[1], parsedTag.baseVersion) > 0) {
          shouldPromote = false;
        }
      } else if (latestResponse.status !== 404) {
        const detail = ctx.sanitize(await readErrorBody(latestResponse));
        throw new Error(
          `Failed to check current latest GitCode release (${latestResponse.status})${detail ? `: ${detail}` : ''}`,
        );
      }
      if (shouldPromote) {
        targetStatus = 'latest';
        promotedToLatest = true;
      }
    }
  }

  const patchResponse = await ctx.fetchImpl(
    `${ctx.releasesBaseUrl}/${encodeURIComponent(parsedTag.tag)}`,
    {
      method: 'PATCH',
      headers: {
        ...ctx.authHeaders,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        name: ctx.releaseName,
        body: options.notesText,
        release_status: targetStatus,
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!patchResponse.ok) {
    const detail = ctx.sanitize(await readErrorBody(patchResponse));
    throw new Error(
      `Failed to publish GitCode release ${parsedTag.tag} (${patchResponse.status})${detail ? `: ${detail}` : ''}`,
    );
  }

  return {
    releaseUrl: ctx.releaseUrl,
    tag: parsedTag.tag,
    releaseStatus: targetStatus,
    promotedToLatest,
    verifiedAssets: requiredAssetNames,
  };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (command === 'stage') {
    const { values } = parseArgs({
      args: rest,
      options: {
        tag: { type: 'string' },
        commit: { type: 'string' },
        'archive-dir': { type: 'string' },
        'artifact-name': { type: 'string' },
        name: { type: 'string' },
        'build-id': { type: 'string' },
        'native-build-version': { type: 'string' },
        summary: { type: 'string' },
      },
      strict: true,
    });

    if (!values.tag || !values.commit || !values['archive-dir'] || !values['artifact-name']) {
      throw new Error(
        'Missing required flags for stage: --tag, --commit, --archive-dir, --artifact-name.',
      );
    }

    const result = await stageGitcodeRelease({
      tag: values.tag,
      commitSha: values.commit,
      archiveDir: values['archive-dir'],
      artifactName: values['artifact-name'],
      releaseName: values.name,
      buildId: values['build-id'],
      nativeBuildVersion: values['native-build-version'],
    });

    if (values.summary) {
      appendFileSync(
        values.summary,
        `GitCode Staged Release (${result.releaseStatus}): ${result.releaseUrl}\n`,
      );
    }
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'publish') {
    const { values } = parseArgs({
      args: rest,
      options: {
        tag: { type: 'string' },
        'notes-file': { type: 'string' },
        'artifact-name': { type: 'string' },
        name: { type: 'string' },
        summary: { type: 'string' },
      },
      strict: true,
    });

    if (!values.tag || !values['notes-file']) {
      throw new Error('Missing required flags for publish: --tag, --notes-file.');
    }

    const result = await publishGitcodeRelease({
      tag: values.tag,
      notesText: readFileSync(resolve(values['notes-file']), 'utf8'),
      artifactName: values['artifact-name'],
      releaseName: values.name,
    });

    if (values.summary) {
      appendFileSync(
        values.summary,
        `GitCode Release (${result.releaseStatus}): ${result.releaseUrl}\n`,
      );
    }
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error(
    'Usage: publishGitcodeRelease.ts <stage|publish> [options]. Expected subcommand `stage` or `publish`.',
  );
}

if ((process.argv[1] ?? '').endsWith('publishGitcodeRelease.ts')) {
  void main().catch((error) => {
    const token = process.env.GITCODE_TOKEN ?? '';
    console.error(
      sanitizeSecrets(error instanceof Error ? error.message : String(error), token ? [token] : []),
    );
    process.exitCode = 1;
  });
}
