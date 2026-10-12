import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

function nativeBrowserRedirect(file: string): string {
  for (let directory = dirname(file); ; directory = dirname(directory)) {
    const packageJson = join(directory, 'package.json');
    if (existsSync(packageJson)) {
      const browser = JSON.parse(readFileSync(packageJson, 'utf8')).browser;
      const replacement = browser?.[`./${relative(directory, file)}`];
      return typeof replacement === 'string' ? join(directory, replacement) : file;
    }
    if (directory === dirname(directory)) return file;
  }
}

/** Resolve an Earendil package specifier from `origin` as Metro selects its import entry. */
function resolveEarendilModule(specifier: string, origin: string): string | undefined {
  const match = /^@earendil-works\/([^/]+)(?:\/(.+))?$/.exec(specifier);
  if (!match?.[1]) return undefined;
  let packageDirectory: string | undefined;
  for (let directory = origin; !packageDirectory; directory = dirname(directory)) {
    const candidate = join(directory, 'node_modules/@earendil-works', match[1]);
    if (existsSync(join(candidate, 'package.json'))) packageDirectory = realpathSync(candidate);
    else if (directory === dirname(directory)) return undefined;
  }
  const exportsMap = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'))
    .exports as Record<string, { import?: string }>;
  const subpath = match[2] ? `./${match[2]}` : '.';
  const exact = exportsMap[subpath]?.import;
  if (exact) return join(packageDirectory, exact);
  for (const [key, value] of Object.entries(exportsMap)) {
    const [prefix, suffix = ''] = key.split('*');
    if (!key.includes('*') || !value.import || !subpath.startsWith(prefix ?? '')) continue;
    if (!subpath.endsWith(suffix)) continue;
    const middle = subpath.slice(prefix?.length ?? 0, subpath.length - suffix.length);
    return join(packageDirectory, value.import.replace('*', middle));
  }
  return undefined;
}

/** Every Earendil module Metro reaches from the entries the app imports. */
function readModuleGraph(entries: string[]): Map<string, string> {
  const pending = entries.map((entry) => resolveEarendilModule(entry, process.cwd()) ?? entry);
  const modules = new Map<string, string>();

  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || modules.has(file)) continue;
    const source = readFileSync(file, 'utf8');
    modules.set(file, source);
    for (const match of source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (!specifier) continue;
      const dependency = specifier.startsWith('.')
        ? resolve(dirname(file), specifier)
        : resolveEarendilModule(specifier, dirname(file));
      if (dependency && existsSync(dependency)) pending.push(nativeBrowserRedirect(dependency));
    }
  }

  return modules;
}

describe('Pi React Native patches', () => {
  test('keeps the durable storage and model registry graph portable with native auth discovery', () => {
    const graph = readModuleGraph([
      '@earendil-works/pi-durable',
      '@earendil-works/pi-durable/storage/sqlite',
      '@earendil-works/pi-ai/models',
    ]);
    expect([...graph.keys()].some((file) => file.endsWith('/auth/context.native.js'))).toBe(true);
    for (const [file, source] of graph) {
      expect({
        file,
        nodeImport: /(?:from\s+|require\(|import\()\s*["']node:/.test(source),
        computedImport: /\bimport\((?!\s*["'])/.test(source),
      }).toEqual({ file, nodeImport: false, computedImport: false });
    }
  });

  test('keeps the Runtime graph free of Pi auth loaders and Node-only modules', () => {
    // Keep in sync with the Pi value imports under src/backend/ai/agent/runtime/pi.
    const graph = readModuleGraph([
      '@earendil-works/chord/context',
      '@earendil-works/pi-durable',
      '@earendil-works/pi-durable/storage/sqlite',
      '@earendil-works/pi-ai/api/anthropic-messages',
      '@earendil-works/pi-ai/api/azure-openai-responses',
      '@earendil-works/pi-ai/api/lazy',
      '@earendil-works/pi-ai/api/openai-completions',
      '@earendil-works/pi-ai/api/openai-responses',
      '@earendil-works/pi-ai/api/simple-options',
      '@earendil-works/pi-ai/models',
      '@earendil-works/pi-ai/utils/estimate',
      '@earendil-works/pi-ai/utils/event-stream',
      '@earendil-works/pi-ai/utils/transcript',
    ]);
    const aiDist = `${realpathSync(`${process.cwd()}/node_modules/@earendil-works/pi-ai`)}/dist`;

    // The pi-ai entry reaches OAuth loaders that Metro cannot bundle. The catalog's auth
    // resolution stays on the native-safe modules the selective OAuth entry also uses.
    expect([...graph.keys()]).not.toContain(`${aiDist}/index.js`);
    expect(
      [...graph.keys()]
        .filter((file) => file.startsWith(`${aiDist}/auth/`))
        .map((file) => file.slice(aiDist.length + 1))
        .sort(),
    ).toEqual(['auth/context.native.js', 'auth/credential-store.js', 'auth/resolve.js']);
    for (const [file, source] of graph) {
      expect({ file, nodeImport: /(?:from\s+|require\()["']node:/.test(source) }).toEqual({
        file,
        nodeImport: false,
      });
      // Metro rejects import() with a computed specifier.
      expect({ file, dynamicImport: /\bimport\((?!\s*["'])/.test(source) }).toEqual({
        file,
        dynamicImport: false,
      });
    }
  });

  test('bundles only the selected native OAuth flows without Node callback listeners or computed imports', () => {
    const graph = readModuleGraph(['@earendil-works/pi-ai/native-oauth']);
    const paths = [...graph.keys()];
    expect(paths.some((file) => file.endsWith('callback-server.native.js'))).toBe(true);
    expect(paths.some((file) => /\/(models|index)\.js$/.test(file))).toBe(false);
    expect(paths.some((file) => /\/(anthropic|radius|openai-chatgpt|load)\.js$/.test(file))).toBe(
      false,
    );
    for (const [file, source] of graph) {
      expect({
        file,
        nodeImport: /(?:from\s+|require\(|import\()\s*["']node:/.test(source),
      }).toEqual({ file, nodeImport: false });
      expect({ file, computedImport: /\bimport\((?!\s*["'])/.test(source) }).toEqual({
        file,
        computedImport: false,
      });
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
