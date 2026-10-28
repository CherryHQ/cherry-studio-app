import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('native Vertex adapter patches', () => {
  it('uses host bearer auth and fetch with the real Web SDK, preserving tools, signatures, errors and cancellation', () => {
    // Node ESM loads the exact Web distribution; the fixture supplies every HTTP response.
    expect(
      execFileSync(
        process.execPath,
        [resolve('src/backend/ai/agent/runtime/pi/__tests__/_vertexNativeFixture.mjs')],
        { encoding: 'utf8', timeout: 15000 },
      ),
    ).toBe('ok');
  });

  it.each([
    '@earendil-works/pi-ai@1.4.0',
    '@google/genai@2.21.0',
    '@anthropic-ai/vertex-sdk@0.22.0',
  ])('pins %s to its versioned patch and lockfile hash', (name) => {
    const path = `patches/${name.replace('/', '__')}.patch`;
    const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
    expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(`'${name}': ${path}`);
    expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(`  '${name}': ${hash}\n`);
  });
});
