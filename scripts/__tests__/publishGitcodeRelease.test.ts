import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { publishGitcodeRelease, verifyArchivedApk } from '../publishGitcodeRelease';

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
    notesText: `# Cherry Studio ${version}\n\n本版修复了会话显示问题。\n\n## 下载安装\n`,
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

      if (method === 'GET' && url.endsWith('/commits/v0.6.2')) {
        return new Response('{}', { status: 404 });
      }

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

      if (method === 'GET' && url.endsWith('/releases/latest?type=latest')) {
        return new Response(JSON.stringify({ tag_name: 'v0.6.1' }), { status: 200 });
      }

      if (method === 'POST' && url.endsWith('/releases')) {
        return new Response(JSON.stringify({ tag_name: 'v0.6.2' }), { status: 201 });
      }

      if (method === 'PATCH' && url.endsWith('/releases/v0.6.2')) {
        return new Response(JSON.stringify({ tag_name: 'v0.6.2' }), { status: 200 });
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
      notesText: fixture.notesText,
      token,
      // Simulate GitHub Actions passing empty strings for unset optional vars.
      env: {
        NODE_ENV: 'test',
        GITCODE_API_URL: '   ',
        GITCODE_OWNER: '',
        GITCODE_REPO: '',
      },
      fetchImpl,
      sleep: async () => {},
      createFileBody: async () => Buffer.from('body'),
    });

    expect(result).toEqual({
      releaseUrl: 'https://gitcode.com/CherryHQ/cherry-studio-app/releases/tag/v0.6.2',
      tag: 'v0.6.2',
      releaseStatus: 'latest',
      created: true,
      patched: true,
      promotedToLatest: true,
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

    // Stable releases must stage as pre-release first and promote to latest only after attachment verification.
    const postCall = calls.find((call) => call.method === 'POST')!;
    const postPayload = JSON.parse(postCall.body!);
    expect(postPayload.release_status).toBe('pre');
    expect(postPayload.target_commitish).toBe(commitSha);
    expect(postPayload.body).toBe(fixture.notesText);

    const patchIndex = calls.findIndex((call) => call.method === 'PATCH');
    const lastPutIndex = calls.map((call) => call.method).lastIndexOf('PUT');
    expect(patchIndex).toBeGreaterThan(lastPutIndex);
    const patchPayload = JSON.parse(calls[patchIndex]!.body!);
    expect(patchPayload.release_status).toBe('latest');

    // Never forward GitCode bearer token to third-party signed upload storage URLs.
    const putCalls = calls.filter((call) => call.method === 'PUT');
    expect(putCalls.every((call) => call.auth === null)).toBe(true);
  });

  it('never promotes a new stable release to latest if attachment upload fails', async () => {
    const fixture = makeArchiveFixture('0.6.2');
    const methods: string[] = [];

    const fetchImpl: typeof fetch = jest.fn(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      methods.push(method);
      if (method === 'GET' && url.includes('/commits/')) {
        return new Response('{}', { status: 404 });
      }
      if (method === 'GET' && url.includes('/releases/tags/')) {
        return new Response('{}', { status: 404 });
      }
      if (method === 'POST') {
        return new Response('{}', { status: 201 });
      }
      if (url.includes('/upload_url')) {
        return new Response('upload failed', { status: 500 });
      }
      throw new Error(`Unexpected ${method} ${url}`);
    });

    await expect(
      publishGitcodeRelease({
        tag: 'v0.6.2',
        commitSha,
        archiveDir: fixture.archiveDir,
        artifactName: fixture.artifactName,
        notesText: fixture.notesText,
        token,
        fetchImpl,
        sleep: async () => {},
        createFileBody: async () => Buffer.from('body'),
      }),
    ).rejects.toThrow('Failed to upload');

    expect(methods).toContain('POST');
    expect(methods).not.toContain('PATCH');
  });

  it('marks prerelease tags as release_status=pre', async () => {
    const fixture = makeArchiveFixture('0.6.2-rc.1');
    let createdPayload: Record<string, unknown> | undefined;
    let calls = 0;

    const fetchImpl: typeof fetch = jest.fn(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url.includes('/commits/')) {
        return new Response('{}', { status: 404 });
      }
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
      notesText: fixture.notesText,
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
      if (method === 'GET' && url.endsWith('/commits/v0.6.2')) {
        return new Response(JSON.stringify({ sha: commitSha }), { status: 200 });
      }
      if (method === 'GET' && url.endsWith('/releases/tags/v0.6.2')) {
        return new Response(
          JSON.stringify({
            tag_name: 'v0.6.2',
            body: '# Cherry Studio 0.6.2\n\n发布后补充的说明\n\n## 下载安装\n',
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
      notesText: fixture.notesText,
      token,
      fetchImpl,
      sleep: async () => {},
    });
    expect(reused.created).toBe(false);
    expect(reused.patched).toBe(false);
    expect(reused.promotedToLatest).toBe(false);
    expect(reused.uploaded).toEqual([]);
    expect(reused.skipped).toEqual([fixture.artifactName, 'SHA256SUMS']);

    remoteApkBytes = Buffer.from('different-apk-bytes');
    await expect(
      publishGitcodeRelease({
        tag: 'v0.6.2',
        commitSha,
        archiveDir: fixture.archiveDir,
        artifactName: fixture.artifactName,
        notesText: fixture.notesText,
        token,
        fetchImpl,
        sleep: async () => {},
      }),
    ).rejects.toThrow('checksum mismatch');
  });

  it('rejects publishing when GitCode tag points to a different commit SHA', async () => {
    const fixture = makeArchiveFixture('0.6.2');
    const seenMethods: string[] = [];

    const fetchImpl: typeof fetch = jest.fn(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      seenMethods.push(`${method} ${url}`);
      if (method === 'GET' && url.endsWith('/commits/v0.6.2')) {
        return new Response(JSON.stringify({ sha: 'f'.repeat(40) }), { status: 200 });
      }
      throw new Error(`Unexpected ${method} ${url}`);
    });

    await expect(
      publishGitcodeRelease({
        tag: 'v0.6.2',
        commitSha,
        archiveDir: fixture.archiveDir,
        artifactName: fixture.artifactName,
        notesText: fixture.notesText,
        token,
        fetchImpl,
      }),
    ).rejects.toThrow('points to commit');
    expect(seenMethods).toHaveLength(1);
  });

  it('does not promote an older stable retry to latest when a newer stable release exists', async () => {
    const fixture = makeArchiveFixture('0.6.2');
    const methods: string[] = [];
    let verified = false;

    const fetchImpl: typeof fetch = jest.fn(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      methods.push(`${method} ${url}`);
      if (method === 'GET' && url.endsWith('/commits/v0.6.2')) {
        return new Response(JSON.stringify({ sha: commitSha }), { status: 200 });
      }
      if (method === 'GET' && url.endsWith('/releases/tags/v0.6.2')) {
        if (!verified) {
          verified = true;
          return new Response(
            JSON.stringify({
              tag_name: 'v0.6.2',
              body: fixture.notesText,
              release_status: 'pre',
              assets: [],
            }),
            { status: 200 },
          );
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
      if (method === 'GET' && url.includes('/upload_url')) {
        return new Response(JSON.stringify({ url: 'https://upload.example.test/obj' }), {
          status: 200,
        });
      }
      if (method === 'PUT') {
        return new Response('', { status: 200 });
      }
      if (method === 'GET' && url.endsWith('/releases/latest?type=latest')) {
        return new Response(JSON.stringify({ tag_name: 'v0.7.0' }), { status: 200 });
      }
      throw new Error(`Unexpected ${method} ${url}`);
    });

    const result = await publishGitcodeRelease({
      tag: 'v0.6.2',
      commitSha,
      archiveDir: fixture.archiveDir,
      artifactName: fixture.artifactName,
      notesText: fixture.notesText,
      token,
      fetchImpl,
      sleep: async () => {},
      createFileBody: async () => Buffer.from('body'),
    });

    expect(result.releaseStatus).toBe('pre');
    expect(result.promotedToLatest).toBe(false);
    expect(result.patched).toBe(false);
    expect(result.uploaded).toEqual([fixture.artifactName, 'SHA256SUMS']);
    expect(methods.some((entry) => entry.startsWith('PATCH '))).toBe(false);
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
        notesText: fixture.notesText,
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
        notesText: fixture.notesText,
        token,
        fetchImpl: errorFetch,
      });
    } catch (error) {
      errMessage = (error as Error).message;
    }
    expect(errMessage).toContain('[redacted]');
    expect(errMessage).not.toContain(token);
  });

  it('rejects empty notes before contacting GitCode', async () => {
    const fixture = makeArchiveFixture();
    const fetchImpl = jest.fn();
    await expect(
      publishGitcodeRelease({
        tag: 'v0.6.2',
        commitSha,
        archiveDir: fixture.archiveDir,
        artifactName: fixture.artifactName,
        notesText: '  ',
        token,
        fetchImpl,
      }),
    ).rejects.toThrow('GitCode release notes are empty');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
