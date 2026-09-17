import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const REPOSITORY = 'CherryHQ/cherry-studio-app';
const API_URL = 'https://api.gitcode.com/api/v5';
const REPOSITORY_URL = `https://gitcode.com/${REPOSITORY}.git`;
const MAX_UPLOAD_ATTEMPTS = 3;

interface UploadDestination {
  url: string;
  headers: Record<string, string>;
}

class UploadError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

function curlConfigValue(value: string): string {
  if (/[\r\n\0]/.test(value)) throw new Error('Invalid GitCode upload configuration.');
  return JSON.stringify(value);
}

function uploadFile(path: string, name: string, upload: UploadDestination): void {
  // Send signed URLs and callback headers through stdin, never command arguments or logs.
  const config = [
    `url = ${curlConfigValue(upload.url)}`,
    ...Object.entries(upload.headers).map(
      ([key, value]) => `header = ${curlConfigValue(`${key}: ${value}`)}`,
    ),
  ].join('\n');
  const result = spawnSync(
    'curl',
    [
      '--disable',
      '--config',
      '-',
      '--globoff',
      '--proto',
      '=https',
      '--request',
      'PUT',
      '--upload-file',
      path,
      '--output',
      '/dev/null',
      '--silent',
      '--connect-timeout',
      '30',
      '--speed-limit',
      '1024',
      '--speed-time',
      '60',
      '--max-time',
      '900',
      '--write-out',
      '%{http_code} %{size_upload} %{speed_upload} %{time_total}',
    ],
    { input: config, encoding: 'utf8', timeout: 930_000 },
  );
  if (result.error) throw new Error(`Could not run curl for GitCode attachment ${name}.`);
  const [status, bytes, speed, seconds] = result.stdout.trim().split(/\s+/).map(Number);
  const metrics = `HTTP ${status || 0}, ${bytes || 0} bytes sent, ${speed || 0} bytes/s, ${seconds || 0}s`;
  console.log(`GitCode upload ${name}: curl ${result.status}, ${metrics}`);
  if (result.status === 0 && status >= 200 && status < 300) return;

  // Retry transport failures and transient HTTP responses, not permissions or invalid requests.
  const retryable =
    [5, 6, 7, 18, 28, 35, 52, 55, 56, 92].includes(result.status ?? -1) ||
    [408, 429, 500, 502, 503, 504].includes(status);
  throw new UploadError(`Could not upload ${name}: curl ${result.status}, ${metrics}`, retryable);
}

interface Release {
  assets: { name: string; browser_download_url: string }[];
}

interface PublishOptions {
  token: string;
  tag: string;
  directory: string;
}

async function fileChecksum(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function downloadChecksum(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(900_000) });
  if (!response.ok || !response.body) {
    throw new Error(`Could not download existing GitCode attachment: HTTP ${response.status}`);
  }
  const hash = createHash('sha256');
  const reader = response.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    hash.update(value);
  }
  return hash.digest('hex');
}

export async function publishGitcodeRelease({ token, tag, directory }: PublishOptions) {
  if (!token) throw new Error('Configure the GITCODE_TOKEN Actions secret before publishing.');
  if (!/^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(tag)) {
    throw new Error('RELEASE_TAG must be a version tag such as v0.1.0 or v0.1.0-beta.1.');
  }

  // Validate the local artifact before writing anything to GitCode.
  const checksumFile = (await readFile(join(directory, 'SHA256SUMS'), 'utf8')).trim();
  const match = /^([a-f0-9]{64})  (cherry-studio-[0-9A-Za-z.-]+-android\.apk)$/.exec(checksumFile);
  if (!match || (await fileChecksum(join(directory, match[2]))) !== match[1]) {
    throw new Error('The APK does not match SHA256SUMS.');
  }
  // Check the existing manifest first so a different rebuild cannot add another APK to this tag.
  const files = ['SHA256SUMS', match[2]];
  const notes = await readFile(join(directory, 'release-notes.md'), 'utf8');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const ref = `refs/tags/${tag}`;
  const tagCommit = execFileSync('git', ['rev-parse', `${ref}^{commit}`], {
    encoding: 'utf8',
  }).trim();
  if (tagCommit !== commit)
    throw new Error('The release tag does not match the checked-out commit.');

  async function api(path: string, body?: object): Promise<Response> {
    // Keep the token out of URLs, upload requests, and error messages.
    return fetch(`${API_URL}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
  }

  const userResponse = await api('/user');
  if (!userResponse.ok)
    throw new Error(`GitCode authentication failed: HTTP ${userResponse.status}`);
  const user = (await userResponse.json()) as { login: string };
  if (!user.login) throw new Error('GitCode did not return the token owner.');

  // Only transfer this tag and its reachable commits; never update a branch or force a tag.
  const authorization = Buffer.from(`${user.login}:${token}`).toString('base64');
  const gitEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://gitcode.com/.extraheader',
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${authorization}`,
  };
  const remoteRefs = execFileSync(
    'git',
    ['ls-remote', '--tags', REPOSITORY_URL, ref, `${ref}^{}`],
    {
      encoding: 'utf8',
      env: gitEnv,
    },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(/\s+/));
  const remoteCommit =
    remoteRefs.find(([, name]) => name === `${ref}^{}`)?.[0] ??
    remoteRefs.find(([, name]) => name === ref)?.[0];
  if (remoteCommit && remoteCommit !== commit) {
    throw new Error(`GitCode tag ${tag} points to a different commit; refusing to replace it.`);
  }
  if (!remoteCommit) {
    execFileSync('git', ['push', REPOSITORY_URL, `${ref}:${ref}`], { env: gitEnv, stdio: 'pipe' });
  }

  const releasePath = `/repos/${REPOSITORY}/releases`;
  const tagPath = `${releasePath}/tags/${encodeURIComponent(tag)}`;
  let response = await api(tagPath);
  if (response.status === 404) {
    response = await api(releasePath, {
      tag_name: tag,
      target_commitish: commit,
      name: tag,
      body: notes,
      release_status: tag.includes('-') ? 'pre' : 'latest',
    });
  }
  if (!response.ok) throw new Error(`Could not prepare GitCode release: HTTP ${response.status}`);
  let release = (await response.json()) as Release;

  async function refreshRelease(): Promise<void> {
    const refreshed = await api(tagPath);
    if (!refreshed.ok) throw new Error(`Could not read GitCode release: HTTP ${refreshed.status}`);
    release = (await refreshed.json()) as Release;
  }

  for (const name of files) {
    const localPath = join(directory, name);
    const expectedChecksum = await fileChecksum(localPath);
    for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
      if (attempt > 1) await refreshRelease();
      const existing = release.assets.find((asset) => asset.name === name);
      if (existing) {
        if ((await downloadChecksum(existing.browser_download_url)) !== expectedChecksum) {
          throw new Error(
            `GitCode attachment ${name} has different content; refusing to overwrite it.`,
          );
        }
        console.log(`Reusing GitCode attachment ${name}`);
        break;
      }

      const uploadResponse = await api(
        `${releasePath}/${encodeURIComponent(tag)}/upload_url?file_name=${encodeURIComponent(name)}`,
      );
      if (!uploadResponse.ok) {
        throw new Error(`Could not obtain a GitCode upload URL: HTTP ${uploadResponse.status}`);
      }
      const upload = (await uploadResponse.json()) as UploadDestination;
      if (!upload.url.startsWith('https://') || !upload.headers) {
        throw new Error('GitCode returned an invalid attachment upload destination.');
      }
      console.log(
        `Uploading GitCode attachment ${name}, attempt ${attempt}/${MAX_UPLOAD_ATTEMPTS}`,
      );
      let uploadError: UploadError | undefined;
      try {
        uploadFile(localPath, name, upload);
      } catch (error) {
        if (!(error instanceof UploadError) || !error.retryable) throw error;
        uploadError = error;
      }

      // OBS registers the attachment through a callback; allow it time to appear.
      let attachment: Release['assets'][number] | undefined;
      // A failed request may still have reached OBS. Check its callback before issuing another PUT.
      for (let poll = 0; poll < 6; poll++) {
        await refreshRelease();
        attachment = release.assets.find((asset) => asset.name === name);
        if (attachment) break;
        await delay(5_000);
      }
      if (!attachment && uploadError) {
        if (attempt === MAX_UPLOAD_ATTEMPTS) throw uploadError;
        console.warn(`${uploadError.message}; retrying with a fresh upload URL.`);
        await delay(attempt * 5_000);
        continue;
      }
      if (!attachment) {
        throw new Error(`GitCode attachment ${name} was not registered with the expected content.`);
      }
      if ((await downloadChecksum(attachment.browser_download_url)) !== expectedChecksum) {
        throw new Error(
          `GitCode attachment ${name} has different content; refusing to overwrite it.`,
        );
      }
      console.log(`Published GitCode attachment ${name}`);
      break;
    }
  }

  const summary = `GitCode Release ${tag}: https://gitcode.com/${REPOSITORY}/releases\n`;
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(summary.trim());
}

if (basename(process.argv[1] ?? '') === 'publishGitcodeRelease.ts') {
  publishGitcodeRelease({
    token: process.env.GITCODE_TOKEN ?? '',
    tag: process.env.RELEASE_TAG ?? '',
    directory: process.env.RELEASE_DIRECTORY ?? '',
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'GitCode publishing failed.');
    process.exitCode = 1;
  });
}
