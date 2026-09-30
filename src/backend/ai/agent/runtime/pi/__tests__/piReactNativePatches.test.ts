import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function readLocalModuleGraph(entry: string): string {
  const pending = [entry];
  const visited = new Set<string>();
  const sources: string[] = [];

  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(file, 'utf8');
    sources.push(source);
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (!specifier?.startsWith('.')) continue;
      const dependency = resolve(dirname(file), specifier);
      if (existsSync(dependency)) pending.push(dependency);
    }
  }

  return sources.join('\n');
}

describe('Pi React Native patches', () => {
  test('uses the official portable Agent and AI exports', () => {
    const packageRoot = `${process.cwd()}/node_modules/@earendil-works`;
    const corePackage = JSON.parse(
      readFileSync(`${packageRoot}/pi-agent-core/package.json`, 'utf8'),
    );
    const aiPackage = JSON.parse(readFileSync(`${packageRoot}/pi-ai/package.json`, 'utf8'));

    expect(corePackage.exports['.']).toEqual({
      import: './dist/index.js',
      types: './dist/index.d.ts',
    });
    expect(aiPackage.exports['./utils/*']).toEqual({
      import: './dist/utils/*.js',
      types: './dist/utils/*.d.ts',
    });
    for (const name of ['pi-agent-core', 'pi-ai']) {
      const graph = readLocalModuleGraph(`${packageRoot}/${name}/dist/index.js`);
      expect(graph).not.toMatch(/(?:from\s+|require\()["']node:/);
      expect(graph).not.toContain('from "./node.js"');
    }
  });

  test('does not leave the Bun node:fs fallback in the Pi AI bundle', () => {
    const providerEnv = readFileSync(
      `${process.cwd()}/node_modules/@earendil-works/pi-ai/dist/utils/provider-env.js`,
      'utf8',
    );

    expect(providerEnv).not.toContain('require("node:fs")');
    expect(providerEnv).toContain('function getBunSandboxEnvValue(_name)');
  });

  test('retains structured errors in the supported Pi adapters', () => {
    const responses = readFileSync(
      `${process.cwd()}/node_modules/@earendil-works/pi-ai/dist/api/openai-responses.js`,
      'utf8',
    );
    const responsesShared = readFileSync(
      `${process.cwd()}/node_modules/@earendil-works/pi-ai/dist/api/openai-responses-shared.js`,
      'utf8',
    );
    const azureResponses = readFileSync(
      `${process.cwd()}/node_modules/@earendil-works/pi-ai/dist/api/azure-openai-responses.js`,
      'utf8',
    );
    const additionalAdapters = [
      'anthropic-messages',
      'google-generative-ai',
      'openai-completions',
    ].map((api) =>
      readFileSync(
        `${process.cwd()}/node_modules/@earendil-works/pi-ai/dist/api/${api}.js`,
        'utf8',
      ),
    );

    for (const adapter of [responses, azureResponses, ...additionalAdapters]) {
      expect(adapter).toContain('createAssistantMessageDiagnostic("provider_response_failure"');
      expect(adapter).toContain('status: normalizedError.status');
      expect(adapter).toContain('body: normalizedError.body');
      expect(adapter).toContain('retryable: normalizedError.retryable');
    }
    expect(responsesShared).toContain('code: event.code');
    expect(responsesShared).toContain('error: event');
  });
});
