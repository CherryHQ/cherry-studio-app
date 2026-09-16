import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { publishGitcodeRelease } from '../publishGitcodeRelease';

const mockGit = jest.fn();
const mockCurl = jest.fn();
jest.mock('node:child_process', () => ({
  execFileSync: (...args: unknown[]) => mockGit(...args),
  spawnSync: (...args: unknown[]) => mockCurl(...args),
}));
jest.mock('node:timers/promises', () => ({ setTimeout: async () => {} }));

const COMMIT = 'a'.repeat(40);
const TAG = 'v0.1.0-beta.1';
const APK = 'cherry-studio-0.1.0-2026-09-16-android.apk';
const API = 'https://api.gitcode.com/api/v5/repos/CherryHQ/cherry-studio-app/releases';
const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
const mockFetch = jest.fn<Promise<Response>, [string, RequestInit?]>();
let directory: string;
let remoteCommit: string | undefined;
let hasRelease: boolean;
let attachments: Map<string, Buffer>;

function response(json: unknown, bytes: Buffer = Buffer.alloc(0), status = 200): Response {
  let read = false;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
    body: {
      cancel: async () => {},
      getReader: () => ({
        read: async () => {
          if (read) return { done: true };
          read = true;
          return { done: false, value: bytes };
        },
      }),
    },
  } as Response;
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'gitcode-release-'));
  const apk = Buffer.from('signed APK fixture');
  writeFileSync(join(directory, APK), apk);
  writeFileSync(
    join(directory, 'SHA256SUMS'),
    `${createHash('sha256').update(apk).digest('hex')}  ${APK}\n`,
  );
  writeFileSync(join(directory, 'release-notes.md'), 'Release notes');
  attachments = new Map();
  hasRelease = false;
  remoteCommit = COMMIT;
  mockGit.mockReset().mockImplementation((_command, args: string[]) => {
    if (args[0] === 'ls-remote') return remoteCommit ? `${remoteCommit}\trefs/tags/${TAG}\n` : '';
    return COMMIT;
  });
  mockCurl.mockReset().mockImplementation((_command, args: string[]) => {
    const path = args[args.indexOf('--upload-file') + 1];
    const bytes = readFileSync(path);
    attachments.set(basename(path), bytes);
    return { status: 0, stdout: `200 ${bytes.length} 1000 0.1`, stderr: '' };
  });
  mockFetch.mockReset().mockImplementation(async (url, init) => {
    if (url.endsWith('/user')) return response({ login: 'publisher' });
    if (url === API && init?.method === 'POST') hasRelease = true;
    if (url === API || url === `${API}/tags/${TAG}`) {
      return response(
        {
          assets: [...attachments.keys()].map((name) => ({
            name,
            browser_download_url: `https://downloads.example.test/${name}`,
          })),
        },
        undefined,
        hasRelease ? 200 : 404,
      );
    }
    if (url.includes('/upload_url?')) {
      const name = new URL(url).searchParams.get('file_name');
      return response({
        url: `https://uploads.example.test/${name}?signature=signed-upload-secret`,
        headers: { 'x-obs-callback': 'callback', 'Content-Type': 'application/octet-stream' },
      });
    }
    const name = new URL(url).pathname.slice(1);
    if (url.startsWith('https://downloads.example.test/'))
      return response({}, attachments.get(name));
    throw new Error(`Unexpected request: ${url}`);
  });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: mockFetch });
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch);
});

function publish() {
  return publishGitcodeRelease({ token: 'test-token', tag: TAG, directory });
}

test('rejects a damaged APK before any remote reads or writes', async () => {
  writeFileSync(join(directory, APK), 'damaged');
  await expect(publish()).rejects.toThrow('does not match SHA256SUMS');
  expect(mockFetch).not.toHaveBeenCalled();
  expect(mockGit).not.toHaveBeenCalled();
  expect(mockCurl).not.toHaveBeenCalled();
});

test('refuses to replace a conflicting remote tag', async () => {
  remoteCommit = 'b'.repeat(40);
  await expect(publish()).rejects.toThrow('points to a different commit');
  expect(mockGit.mock.calls.some(([, args]) => args[0] === 'push')).toBe(false);
  expect(mockFetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
});

test('creates a prerelease for the exact tag and uploads both files without leaking the token', async () => {
  remoteCommit = undefined;
  await publish();
  expect(mockGit).toHaveBeenCalledWith(
    'git',
    [
      'push',
      'https://gitcode.com/CherryHQ/cherry-studio-app.git',
      `refs/tags/${TAG}:refs/tags/${TAG}`,
    ],
    expect.any(Object),
  );
  const creation = mockFetch.mock.calls.find(
    ([url, init]) => url === API && init?.method === 'POST',
  );
  expect(JSON.parse(creation?.[1]?.body as string)).toEqual({
    tag_name: TAG,
    target_commitish: COMMIT,
    name: TAG,
    body: 'Release notes',
    release_status: 'pre',
  });
  for (const name of ['SHA256SUMS', APK]) {
    expect(attachments.get(name)).toEqual(readFileSync(join(directory, name)));
  }
  for (const [url, init] of mockFetch.mock.calls) {
    expect(url).not.toContain('test-token');
    expect(init?.method).not.toBe('PUT');
  }
  for (const [, args, options] of mockCurl.mock.calls) {
    expect(args.join(' ')).not.toMatch(/test-token|signed-upload-secret|x-obs-callback/);
    expect(options.input).not.toContain('test-token');
    expect(options.input).toContain('signature=signed-upload-secret');
    expect(options.input).toContain('header = "x-obs-callback: callback"');
  }
});

test('resumes a partial release without replacing its existing checksum file', async () => {
  hasRelease = true;
  attachments.set('SHA256SUMS', readFileSync(join(directory, 'SHA256SUMS')));
  await publish();
  expect(mockCurl).toHaveBeenCalledTimes(1);
  expect(attachments.get(APK)).toEqual(readFileSync(join(directory, APK)));
});

test('rejects a different existing manifest before uploading another APK', async () => {
  hasRelease = true;
  attachments.set('SHA256SUMS', Buffer.from('checksum of a different build'));
  await expect(publish()).rejects.toThrow('different content');
  expect(mockCurl).not.toHaveBeenCalled();
});

function resumeWithManifest() {
  hasRelease = true;
  attachments.set('SHA256SUMS', readFileSync(join(directory, 'SHA256SUMS')));
}

test('recovers from a stalled upload with a fresh destination and the same APK', async () => {
  resumeWithManifest();
  mockCurl.mockReturnValueOnce({ status: 28, stdout: '000 4096 0 60', stderr: '' });
  await publish();
  expect(mockCurl).toHaveBeenCalledTimes(2);
  expect(mockFetch.mock.calls.filter(([url]) => url.includes('/upload_url?'))).toHaveLength(2);
  expect(attachments.get(APK)).toEqual(readFileSync(join(directory, APK)));
});

test('accepts a completed upload after its response is lost without uploading twice', async () => {
  resumeWithManifest();
  mockCurl.mockImplementationOnce(() => {
    attachments.set(APK, readFileSync(join(directory, APK)));
    return { status: 28, stdout: '000 18 0 60', stderr: '' };
  });
  await publish();
  expect(mockCurl).toHaveBeenCalledTimes(1);
});

test('stops after three transport failures and reports safe transfer statistics', async () => {
  resumeWithManifest();
  mockCurl.mockReturnValue({
    status: 28,
    stdout: '000 4096 0 60',
    stderr: 'https://uploads.example.test/?signature=signed-upload-secret',
  });
  const warnings = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await expect(publish()).rejects.toThrow(
      `Could not upload ${APK}: curl 28, HTTP 0, 4096 bytes sent`,
    );
    expect(mockCurl).toHaveBeenCalledTimes(3);
    expect(warnings.mock.calls.flat().join(' ')).not.toContain('signed-upload-secret');
  } finally {
    warnings.mockRestore();
  }
});

test('does not retry a rejected upload', async () => {
  resumeWithManifest();
  mockCurl.mockReturnValue({ status: 0, stdout: '403 0 0 0.1', stderr: '' });
  await expect(publish()).rejects.toThrow('HTTP 403');
  expect(mockCurl).toHaveBeenCalledTimes(1);
});

test('does not overwrite a conflicting attachment discovered after a timeout', async () => {
  resumeWithManifest();
  mockCurl.mockImplementationOnce(() => {
    attachments.set(APK, Buffer.from('another build'));
    return { status: 28, stdout: '000 4096 0 60', stderr: '' };
  });
  await expect(publish()).rejects.toThrow('different content; refusing to overwrite');
  expect(mockCurl).toHaveBeenCalledTimes(1);
});
