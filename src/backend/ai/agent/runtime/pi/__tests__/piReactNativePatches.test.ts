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
  test('exposes the Agent and compaction entries used by Metro', () => {
    const packageJson = JSON.parse(
      readFileSync(
        `${process.cwd()}/node_modules/@earendil-works/pi-agent-core/package.json`,
        'utf8',
      ),
    ) as { exports?: Record<string, unknown> };

    expect(packageJson.exports?.['./agent']).toEqual({
      import: './dist/agent.js',
      types: './dist/agent.d.ts',
    });
    expect(packageJson.exports?.['./compaction']).toEqual({
      import: './dist/harness/compaction/compaction.js',
      types: './dist/harness/compaction/compaction.d.ts',
    });

    const agentLoop = readFileSync(
      `${process.cwd()}/node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js`,
      'utf8',
    );
    expect(agentLoop).not.toContain('from "@earendil-works/pi-ai"');
    expect(agentLoop).toContain('from "@earendil-works/pi-ai/utils/event-stream"');
    expect(agentLoop).toContain('from "@earendil-works/pi-ai/utils/validation"');

    const compactionPath = `${process.cwd()}/node_modules/@earendil-works/pi-agent-core/dist/harness/compaction/compaction.js`;
    const compactionGraph = readLocalModuleGraph(compactionPath);
    expect(compactionGraph).not.toContain('from "node:');
    expect(compactionGraph).not.toContain('from "@earendil-works/pi-ai"');
    expect(compactionGraph).toContain('from "@earendil-works/pi-ai/utils/retry"');
    expect(compactionGraph).toContain('from "@earendil-works/pi-ai/utils/text"');
    expect(compactionGraph).toContain('from "@earendil-works/pi-ai/utils/uuid"');
  });

  test('does not leave the Bun node:fs fallback in the Pi AI bundle', () => {
    const providerEnv = readFileSync(
      `${process.cwd()}/node_modules/@earendil-works/pi-ai/dist/utils/provider-env.js`,
      'utf8',
    );

    expect(providerEnv).not.toContain('require("node:fs")');
    expect(providerEnv).toContain('function getBunSandboxEnvValue(_name)');
  });

  test('keeps supported Pi adapters out of the Pi model and auth graph', () => {
    const packageJson = JSON.parse(
      readFileSync(`${process.cwd()}/node_modules/@earendil-works/pi-ai/package.json`, 'utf8'),
    ) as { exports?: Record<string, unknown> };
    const responses = readFileSync(
      `${process.cwd()}/node_modules/@earendil-works/pi-ai/dist/api/openai-responses.js`,
      'utf8',
    );
    const responsesShared = readFileSync(
      `${process.cwd()}/node_modules/@earendil-works/pi-ai/dist/api/openai-responses-shared.js`,
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

    expect(packageJson.exports).toMatchObject({
      './utils/event-stream': {
        import: './dist/utils/event-stream.js',
        types: './dist/utils/event-stream.d.ts',
      },
      './utils/retry': {
        import: './dist/utils/retry.js',
        types: './dist/utils/retry.d.ts',
      },
      './utils/text': {
        import: './dist/utils/text.js',
        types: './dist/utils/text.d.ts',
      },
      './utils/uuid': {
        import: './dist/utils/uuid.js',
        types: './dist/utils/uuid.d.ts',
      },
      './utils/validation': {
        import: './dist/utils/validation.js',
        types: './dist/utils/validation.d.ts',
      },
    });
    expect(responses).not.toContain('from "../models.js"');
    expect(responsesShared).not.toContain('from "../models.js"');
    expect(responses).toContain('from "../utils/model-runtime.js"');
    expect(responsesShared).toContain('from "../utils/model-runtime.js"');
    for (const adapter of [responses, ...additionalAdapters]) {
      expect(adapter).toContain('createAssistantMessageDiagnostic("provider_response_failure"');
      expect(adapter).toContain('status: normalizedError.status');
      expect(adapter).toContain('body: normalizedError.body');
      expect(adapter).toContain('retryable: normalizedError.retryable');
    }
    for (const adapter of additionalAdapters) {
      expect(adapter).not.toContain('from "../models.js"');
      expect(adapter).toContain('from "../utils/model-runtime.js"');
    }
  });
});
