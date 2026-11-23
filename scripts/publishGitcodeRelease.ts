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

export interface PublishGitcodeReleaseOptions {
  tag: string;
  commitSha: string;
  archiveDir: string;
  artifactName: string;
  releaseName?: string;
  notesText?: string;
  buildId?: string;
  nativeBuildVersion?: string;
  apiUrl?: string;
  owner?: string;
  repo?: string;
  token?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  createFileBody?: (filePath: string) => Promise<BodyInit>;
}

export interface PublishGitcodeReleaseResult {
  releaseUrl: string;
  tag: string;
  releaseStatus: 'pre' | 'latest';
  created: boolean;
  patched: boolean;
  uploaded: string[];
  skipped: string[];
  hashes: Record<string, string>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolvePromise) => setTimeout(resolvePromise, ms));

const defaultCreateFileBody = async (filePath: string): Promise<BodyInit> => openAsBlob(filePath);

function isAttachmentAsset(asset: GitcodeAsset): boolean {
  return asset.type === undefined || asset.type === 'attach';
}

export function buildDefaultGitcodeNotes({
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
    `版本 \`${tag}\` 的 Android 公开安装包已构建并校验完成。`,
    `完整变更说明请查看 GitHub Release：https://github.com/CherryHQ/cherry-studio-app/releases/tag/${tag}`,
    '',
    '## 下载安装',
    '',
    `- Android：下载附件 \`${artifactName}\`（ARM64）并在设备上安装。`,
    '- Google Play 与 iOS App Store 的上架进度取决于各自审核流程，与本页面安装包相互独立。',
    '- 文件校验值已附在 `SHA256SUMS` 中。',
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
  const checksumLines = readFileSync(checksumPath, 'utf8').split(/\r?\n/);
  const matches: string[] = [];

  for (const line of checksumLines) {
    const match = /^([a-fA-F0-9]{64}) [ *](\S+)$/.exec(line);
    if (match?.[2] === artifactName) {
      matches.push(match[1]!.toLowerCase());
    }
  }

  if (matches.length !== 1) {
    throw new Error(`Missing or ambiguous SHA256SUMS entry for ${artifactName}.`);
  }
  if (matches[0] !== apkEvidence.sha256) {
    throw new Error(
      `SHA256SUMS mismatch for ${artifactName}: expected ${matches[0]}, got ${apkEvidence.sha256}.`,
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

export async function publishGitcodeRelease(
  options: PublishGitcodeReleaseOptions,
): Promise<PublishGitcodeReleaseResult> {
  const env = options.env ?? process.env;
  const parsedTag = parseReleaseTag(options.tag);
  if (!SHA_RE.test(options.commitSha)) {
    throw new Error(`Invalid commit SHA: ${options.commitSha}`);
  }
  const commitSha = options.commitSha.toLowerCase();

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

  const apiUrl = (options.apiUrl ?? env.GITCODE_API_URL ?? DEFAULT_API_URL)
    .trim()
    .replace(/\/+$/, '');
  const owner = (options.owner ?? env.GITCODE_OWNER ?? DEFAULT_OWNER).trim();
  const repo = (options.repo ?? env.GITCODE_REPO ?? DEFAULT_REPO).trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const createFileBody = options.createFileBody ?? defaultCreateFileBody;

  // Validate archived files and SHA256SUMS locally before touching the remote API.
  const verified = await verifyArchivedApk(options.archiveDir, options.artifactName);
  const releaseStatus: 'pre' | 'latest' = parsedTag.isPrerelease ? 'pre' : 'latest';
  const releaseName = options.releaseName?.trim() || parsedTag.tag;
  const defaultBody = buildDefaultGitcodeNotes({
    releaseVersion: parsedTag.releaseVersion,
    tag: parsedTag.tag,
    commitSha,
    buildId: options.buildId,
    nativeBuildVersion: options.nativeBuildVersion,
    artifactName: options.artifactName,
    artifactSha256: verified.hashes[options.artifactName]!,
  });

  const releasesBaseUrl = `${apiUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases`;
  const tagReleaseUrl = `${releasesBaseUrl}/tags/${encodeURIComponent(parsedTag.tag)}`;
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };

  let created = false;
  let patched = false;
  let existingAssets: GitcodeAsset[] = [];

  const getResponse = await fetchImpl(tagReleaseUrl, {
    method: 'GET',
    headers: authHeaders,
    signal: AbortSignal.timeout(60_000),
  });

  if (getResponse.status === 200) {
    const existing = (await getResponse.json()) as GitcodeRelease;
    existingAssets = Array.isArray(existing.assets) ? existing.assets : [];

    const hasExplicitNotes = Boolean(options.notesText?.trim());
    const existingBody = existing.body?.trim() ?? '';
    const needsPatch =
      hasExplicitNotes || !existingBody || existing.release_status !== releaseStatus;

    if (needsPatch) {
      const bodyToWrite = hasExplicitNotes
        ? options.notesText!
        : existingBody
          ? existing.body!
          : defaultBody;
      const patchResponse = await fetchImpl(
        `${releasesBaseUrl}/${encodeURIComponent(parsedTag.tag)}`,
        {
          method: 'PATCH',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({
            name: releaseName,
            body: bodyToWrite,
            release_status: releaseStatus,
          }),
          signal: AbortSignal.timeout(60_000),
        },
      );
      if (!patchResponse.ok) {
        const detail = sanitize(await readErrorBody(patchResponse));
        throw new Error(
          `Failed to update GitCode release ${parsedTag.tag} (${patchResponse.status})${detail ? `: ${detail}` : ''}`,
        );
      }
      patched = true;
    }
  } else if (getResponse.status === 404) {
    const bodyToWrite = options.notesText?.trim() ? options.notesText : defaultBody;
    const createResponse = await fetchImpl(releasesBaseUrl, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        tag_name: parsedTag.tag,
        name: releaseName,
        body: bodyToWrite,
        target_commitish: commitSha,
        release_status: releaseStatus,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!createResponse.ok) {
      const detail = sanitize(await readErrorBody(createResponse));
      const mirrorHint =
        createResponse.status >= 400 && createResponse.status < 500
          ? ` If the GitCode mirror has not synced commit ${commitSha} yet, sync the mirror and re-run publish-gitcode.`
          : '';
      throw new Error(
        `Failed to create GitCode release ${parsedTag.tag} (${createResponse.status}).${mirrorHint}${detail ? ` Detail: ${detail}` : ''}`,
      );
    }
    created = true;
  } else {
    const detail = sanitize(await readErrorBody(getResponse));
    throw new Error(
      `Failed to query GitCode release ${parsedTag.tag} (${getResponse.status})${detail ? `: ${detail}` : ''}`,
    );
  }

  // Upload the APK before SHA256SUMS so update clients never resolve checksums without the binary.
  const filesToPublish = [
    { name: options.artifactName, path: verified.artifactPath },
    { name: 'SHA256SUMS', path: verified.checksumPath },
  ];

  const uploaded: string[] = [];
  const skipped: string[] = [];
  const apiOrigin = new URL(apiUrl).origin;

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
      const downloadOrigin = new URL(existingAsset.browser_download_url).origin;
      const downloadResponse = await fetchImpl(existingAsset.browser_download_url, {
        method: 'GET',
        headers: downloadOrigin === apiOrigin ? { Authorization: `Bearer ${token}` } : undefined,
        signal: AbortSignal.timeout(120_000),
      });
      if (!downloadResponse.ok) {
        const detail = sanitize(await readErrorBody(downloadResponse));
        throw new Error(
          `Failed to verify existing GitCode attachment ${file.name} (${downloadResponse.status})${detail ? `: ${detail}` : ''}`,
        );
      }
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
        const uploadUrlEndpoint = `${releasesBaseUrl}/${encodeURIComponent(parsedTag.tag)}/upload_url?file_name=${encodeURIComponent(file.name)}`;
        const urlResponse = await fetchImpl(uploadUrlEndpoint, {
          method: 'GET',
          headers: authHeaders,
          signal: AbortSignal.timeout(60_000),
        });
        if (!urlResponse.ok) {
          const detail = sanitize(await readErrorBody(urlResponse));
          throw new Error(
            `upload_url returned ${urlResponse.status}${detail ? `: ${detail}` : ''}`,
          );
        }
        const uploadInfo = (await urlResponse.json()) as GitcodeUploadUrlResponse;
        if (!uploadInfo.url) {
          throw new Error(`upload_url response for ${file.name} did not include url.`);
        }

        const putResponse = await fetchImpl(uploadInfo.url, {
          method: 'PUT',
          headers: uploadInfo.headers ?? {},
          body: await createFileBody(file.path),
          signal: AbortSignal.timeout(3_600_000),
        });
        if (!putResponse.ok) {
          const detail = sanitize(await readErrorBody(putResponse));
          throw new Error(
            `attachment PUT returned ${putResponse.status}${detail ? `: ${detail}` : ''}`,
          );
        }

        uploadSucceeded = true;
        break;
      } catch (error) {
        lastErrorMessage = sanitize(error instanceof Error ? error.message : String(error));
        if (attempt < UPLOAD_ATTEMPTS) {
          await sleep(UPLOAD_RETRY_DELAY_MS);
        }
      }
    }

    if (!uploadSucceeded) {
      throw new Error(
        `Failed to upload ${file.name} to GitCode release ${parsedTag.tag} after ${UPLOAD_ATTEMPTS} attempts: ${lastErrorMessage}`,
      );
    }
    uploaded.push(file.name);
  }

  if (uploaded.length > 0) {
    let verifiedRemote = false;
    for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt++) {
      const checkResponse = await fetchImpl(tagReleaseUrl, {
        method: 'GET',
        headers: authHeaders,
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
        `GitCode release ${parsedTag.tag} did not list all expected attachments after upload.`,
      );
    }
  }

  const webBaseUrl = new URL(apiUrl).origin.replace(/^https?:\/\/api\./, 'https://');
  const releaseWebUrl = `${webBaseUrl}/${owner}/${repo}/releases/tag/${parsedTag.tag}`;

  return {
    releaseUrl: releaseWebUrl,
    tag: parsedTag.tag,
    releaseStatus,
    created,
    patched,
    uploaded,
    skipped,
    hashes: verified.hashes,
  };
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      tag: { type: 'string' },
      commit: { type: 'string' },
      'archive-dir': { type: 'string' },
      'artifact-name': { type: 'string' },
      name: { type: 'string' },
      'notes-file': { type: 'string' },
      'build-id': { type: 'string' },
      'native-build-version': { type: 'string' },
      summary: { type: 'string' },
    },
    strict: true,
  });

  if (!values.tag || !values.commit || !values['archive-dir'] || !values['artifact-name']) {
    throw new Error('Missing required flags: --tag, --commit, --archive-dir, --artifact-name.');
  }

  const notesText = values['notes-file']
    ? readFileSync(resolve(values['notes-file']), 'utf8')
    : undefined;

  const result = await publishGitcodeRelease({
    tag: values.tag,
    commitSha: values.commit,
    archiveDir: values['archive-dir'],
    artifactName: values['artifact-name'],
    releaseName: values.name,
    notesText,
    buildId: values['build-id'],
    nativeBuildVersion: values['native-build-version'],
  });

  if (values.summary) {
    appendFileSync(values.summary, `GitCode Release: ${result.releaseUrl}\n`);
  }

  console.log(JSON.stringify(result, null, 2));
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
