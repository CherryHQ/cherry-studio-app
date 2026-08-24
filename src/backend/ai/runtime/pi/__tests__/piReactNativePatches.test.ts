import { readFileSync } from 'node:fs';

describe('Pi React Native patches', () => {
  test('exposes only the Agent runtime entry used by Metro', () => {
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

    const agentLoop = readFileSync(
      `${process.cwd()}/node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js`,
      'utf8',
    );
    expect(agentLoop).not.toContain('from "@earendil-works/pi-ai"');
    expect(agentLoop).toContain('from "@earendil-works/pi-ai/utils/event-stream"');
    expect(agentLoop).toContain('from "@earendil-works/pi-ai/utils/validation"');
  });

  test('does not leave the Bun node:fs fallback in the Pi AI bundle', () => {
    const providerEnv = readFileSync(
      `${process.cwd()}/node_modules/@earendil-works/pi-ai/dist/utils/provider-env.js`,
      'utf8',
    );

    expect(providerEnv).not.toContain('require("node:fs")');
    expect(providerEnv).toContain('function getBunSandboxEnvValue(_name)');
  });

  test('keeps the OpenAI Responses runtime out of the Pi model and auth graph', () => {
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

    expect(packageJson.exports).toMatchObject({
      './utils/event-stream': {
        import: './dist/utils/event-stream.js',
        types: './dist/utils/event-stream.d.ts',
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
  });
});
