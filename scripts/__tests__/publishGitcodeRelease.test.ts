import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildDefaultGitcodeNotes,
  publishGitcodeRelease,
  verifyArchivedApk,
} from '../publishGitcodeRelease';

const createdRoots: string[] = [];

function makeArchiveFixture(version = '0.6.2') {
  const root = mkdtempSync(join(tmpdir(), 'cherry-gitcode-test-'));
  createdRoots.push(root);
  const archiveDir = join(root, 'archive');
  mkdirSync(archiveDir, { recursive: true });
  const artifactName = `cherry-studio-${version}-android.apk`;
  const apkBytes = Buffer.from(`synthetic-apk-${version}`);
  const apkSha256 = createHash('sha256').update(apkBytes).digest('hex');
  const checksumContent = `${apkSha256}  ${artifactName}\n`;
  const checksumSha256 = createHash('sha256').update(checksumContent).digest('hex');
  writeFileSync(join(archiveDir, artifactName), apkBytes);
  writeFileSync(join(archiveDir, 'SHA256SUMS'), checksumContent);
  return {
    root,
    archiveDir,
    artifactName,
    apkBytes,
    apkSha256,
    checksumContent,
    checksumSha256,
  };
}

afterEach(() => {
  for (const root of createdRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('publishGitcodeRelease', () => {
  const commitSha = '1e1bc7acbe0e23dbde016b0e97976f24651c487f';
  const token = 'synthetic-gitcode-token-secret-1234';

  it('creates a new stable release, uploads APK before SHA256SUMS, and verifies attachments', async () => {
    const fixture = makeArchiveFixture('0.6.2');
    const calls: { method: string; url: string; body?: string; auth?: string | null }[] = [];
    const uploadedOrder: string[] = [];
    let verifiedOnce = false;

    const fetchImpl: typeof fetch = jest.fn(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const headers = new Headers(init?.headers);
      calls.push({
        method,
        url,
        body: typeof init?.body === 'string' ? init.body : undefined,
        auth: headers.get('Authorization'),
      });

      if (method === 'GET' && url.endsWith('/releases/tags/v0.6.2')) {
        if (!verifiedOnce) {
          verifiedOnce = true;
          return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
        }
        return new Response(
          JSON.stringify({
            tag_name: 'v0.6.2',
            assets: [
              { name: fixture.artifactName, type: 'attach' },
              { name: 'SHA256SUMS', type: 'attach' },
            ],
          }),
          { status: 200 },
        );
      }

      if (method === 'POST' && url.endsWith('/releases')) {
        return new Response(JSON.stringify({ tag_name: 'v0.6.2' }), { status: 201 });
      }

      if (method === 'GET' && url.includes('/upload_url?file_name=')) {
        const fileName = decodeURIComponent(new URL(url).searchParams.get('file_name')!);
        uploadedOrder.push(`url:${fileName}`);
        return new Response(
          JSON.stringify({
            url: `https://upload.example.test/bucket/${fileName}`,
            headers: { 'x-oss-meta': '1' },
          }),
          { status: 200 },
        );
      }

      if (method === 'PUT' && url.startsWith('https://upload.example.test/bucket/')) {
        const fileName = url.split('/').pop()!;
        uploadedOrder.push(`put:${fileName}`);
        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected fetch ${method} ${url}`);
    });

    const result = await publishGitcodeRelease({
      tag: 'v0.6.2',
      commitSha,
      archiveDir: fixture.archiveDir,
      artifactName: fixture.artifactName,
      buildId: 'build-uuid-1',
      nativeBuildVersion: '128',
      token,
      fetchImpl,
      sleep: async () => {},
      createFileBody: async () => Buffer.from('body'),
    });

    expect(result).toEqual({
      releaseUrl: 'https://gitcode.com/CherryHQ/cherry-studio-app/releases/tag/v0.6.2',
      tag: 'v0.6.2',
      releaseStatus: 'latest',
      created: true,
      patched: false,
      uploaded: [fixture.artifactName, 'SHA256SUMS'],
      skipped: [],
      hashes: {
        [fixture.artifactName]: fixture.apkSha256,
        SHA256SUMS: fixture.checksumSha256,
      },
    });
    expect(uploadedOrder).toEqual([
      `url:${fixture.artifactName}`,
      `put:${fixture.artifactName}`,
      'url:SHA256SUMS',
      'put:SHA256SUMS',
    ]);

    const postCall = calls.find((call) => call.method === 'POST')!;
    const payload = JSON.parse(postCall.body!);
    expect(payload.release_status).toBe('latest');
    expect(payload.target_commitish).toBe(commitSha);
    expect(payload.body).toMatch(/^# Cherry Studio 0\.6\.2\n/);
    expect(payload.body).toContain('\n## 下载安装\n');

    // Never forward GitCode bearer token to third-party signed upload storage URLs.
    const putCalls = calls.filter((call) => call.method === 'PUT');
    expect(putCalls.every((call) => call.auth === null)).toBe(true);
  });

  it('marks prerelease tags as release_status=pre', async () => {
    const fixture = makeArchiveFixture('0.6.2-rc.1');
    let createdPayload: Record<string, unknown> | undefined;
    let calls = 0;

    const fetchImpl: typeof fetch = jest.fn(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url.includes('/releases/tags/')) {
        calls++;
        if (calls === 1) return new Response('{}', { status: 404 });
        return new Response(
          JSON.stringify({
            assets: [
              { name: fixture.artifactName, type: 'attach' },
              { name: 'SHA256SUMS', type: 'attach' },
            ],
          }),
          { status: 200 },
        );
      }
      if (method === 'POST') {
        createdPayload = JSON.parse(String(init?.body));
        return new Response('{}', { status: 201 });
      }
      if (url.includes('/upload_url')) {
        return new Response(JSON.stringify({ url: 'https://upload.example.test/obj' }), {
          status: 200,
        });
      }
      if (method === 'PUT') return new Response('', { status: 200 });
      throw new Error(`Unexpected ${method} ${url}`);
    });

    const result = await publishGitcodeRelease({
      tag: 'v0.6.2-rc.1',
      commitSha,
      archiveDir: fixture.archiveDir,
      artifactName: fixture.artifactName,
      token,
      fetchImpl,
      sleep: async () => {},
      createFileBody: async () => Buffer.from('body'),
    });

    expect(result.releaseStatus).toBe('pre');
    expect(createdPayload?.release_status).toBe('pre');
  });

  it('preserves existing curated notes and skips identical assets on retry, but rejects mismatched remote assets', async () => {
    const fixture = makeArchiveFixture('0.6.2');
    let remoteApkBytes = fixture.apkBytes;

    const fetchImpl: typeof fetch = jest.fn(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url.endsWith('/releases/tags/v0.6.2')) {
        return new Response(
          JSON.stringify({
            tag_name: 'v0.6.2',
            body: '# Cherry Studio 0.6.2\n\n手工整理中文说明\n\n## 下载安装\n',
            release_status: 'latest',
            assets: [
              {
                name: fixture.artifactName,
                type: 'attach',
                browser_download_url: 'https://cdn.example.test/app.apk',
              },
              {
                name: 'SHA256SUMS',
                type: 'attach',
                browser_download_url: 'https://cdn.example.test/SHA256SUMS',
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url === 'https://cdn.example.test/app.apk') {
        return new Response(Uint8Array.from(remoteApkBytes), { status: 200 });
      }
      if (url === 'https://cdn.example.test/SHA256SUMS') {
        return new Response(fixture.checksumContent, { status: 200 });
      }
      throw new Error(`Unexpected ${method} ${url}`);
    });

    const reused = await publishGitcodeRelease({
      tag: 'v0.6.2',
      commitSha,
      archiveDir: fixture.archiveDir,
      artifactName: fixture.artifactName,
      token,
      fetchImpl,
      sleep: async () => {},
    });
    expect(reused.created).toBe(false);
    expect(reused.patched).toBe(false);
    expect(reused.uploaded).toEqual([]);
    expect(reused.skipped).toEqual([fixture.artifactName, 'SHA256SUMS']);

    remoteApkBytes = Buffer.from('different-apk-bytes');
    await expect(
      publishGitcodeRelease({
        tag: 'v0.6.2',
        commitSha,
        archiveDir: fixture.archiveDir,
        artifactName: fixture.artifactName,
        token,
        fetchImpl,
        sleep: async () => {},
      }),
    ).rejects.toThrow('checksum mismatch');
  });

  it('fails locally on invalid SHA256SUMS without calling fetch, and redacts GITCODE_TOKEN from remote errors', async () => {
    const fixture = makeArchiveFixture('0.6.2');
    writeFileSync(
      join(fixture.archiveDir, 'SHA256SUMS'),
      `${'0'.repeat(64)}  ${fixture.artifactName}\n`,
    );

    const fetchSpy = jest.fn();
    await expect(verifyArchivedApk(fixture.archiveDir, fixture.artifactName)).rejects.toThrow(
      'SHA256SUMS mismatch',
    );
    await expect(
      publishGitcodeRelease({
        tag: 'v0.6.2',
        commitSha,
        archiveDir: fixture.archiveDir,
        artifactName: fixture.artifactName,
        token,
        fetchImpl: fetchSpy as unknown as typeof fetch,
      }),
    ).rejects.toThrow('SHA256SUMS mismatch');
    expect(fetchSpy).not.toHaveBeenCalled();

    // Restore valid checksums and verify token redaction on remote failure.
    writeFileSync(join(fixture.archiveDir, 'SHA256SUMS'), fixture.checksumContent);
    const errorFetch: typeof fetch = jest.fn(async () => {
      return new Response(`bad request token=${token}`, { status: 422 });
    });

    let errMessage = '';
    try {
      await publishGitcodeRelease({
        tag: 'v0.6.2',
        commitSha,
        archiveDir: fixture.archiveDir,
        artifactName: fixture.artifactName,
        token,
        fetchImpl: errorFetch,
      });
    } catch (error) {
      errMessage = (error as Error).message;
    }
    expect(errMessage).toContain('[redacted]');
    expect(errMessage).not.toContain(token);
  });

  it('formats default Chinese release notes matching app update parser markers', () => {
    const notes = buildDefaultGitcodeNotes({
      releaseVersion: '0.6.2',
      tag: 'v0.6.2',
      commitSha,
      buildId: 'id-1',
      nativeBuildVersion: '128',
      artifactName: 'cherry-studio-0.6.2-android.apk',
      artifactSha256: 'a'.repeat(64),
    });
    expect(notes).toMatch(/^# Cherry Studio 0\.6\.2\n/);
    expect(notes).toMatch(/^## 下载安装$/m);
  });
});
