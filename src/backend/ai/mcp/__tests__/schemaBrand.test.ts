import { createRequire } from 'node:module';
import { dirname } from 'node:path';

/**
 * `McpRuntimeService.castMcpToolSet` asserts that tools from `@ai-sdk/mcp` are usable
 * as `ai`'s `ToolSet`. That holds only because both packages resolve schema
 * brands through the *global* symbol registry, so their separate
 * `@ai-sdk/provider-utils` copies agree at runtime.
 *
 * A dependency bump that moved either side to a module-local symbol would make
 * the cast a lie. This fails here rather than on a device.
 */
describe('provider-utils schema brand', () => {
  it('is the same global symbol in both provider-utils copies', () => {
    const appRequire = createRequire(require.resolve('@ai-sdk/provider-utils'));
    const mcpRequire = createRequire(
      `${dirname(require.resolve('@ai-sdk/mcp/package.json'))}/index.js`,
    );

    const appUtils = appRequire('@ai-sdk/provider-utils');
    const mcpUtils = mcpRequire('@ai-sdk/provider-utils');

    // Distinct copies — otherwise this test proves nothing.
    expect(mcpRequire.resolve('@ai-sdk/provider-utils')).not.toBe(
      appRequire.resolve('@ai-sdk/provider-utils'),
    );

    const probe = { type: 'object' as const };
    const appBrands = Object.getOwnPropertySymbols(appUtils.jsonSchema(probe));
    const mcpBrands = Object.getOwnPropertySymbols(mcpUtils.jsonSchema(probe));

    expect(appBrands).toContain(Symbol.for('vercel.ai.schema'));
    expect(mcpBrands).toEqual(appBrands);
  });
});
