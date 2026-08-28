import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { GENERAL_ICONS } from '../../icons-webp/general';
import { MODEL_ICONS } from '../../icons-webp/models';
import { PROVIDER_ICONS } from '../../icons-webp/providers';
import { CATALOG_ONLY_PROVIDER_ICONS } from '../../scripts/catalog-only-provider-icons.generated';
import { resolveProviderIcon } from '../registry';

const iconSourceRoot = join(process.cwd(), 'packages/ui/icons');

function svgKeys(relativePath: string) {
  return readdirSync(join(iconSourceRoot, relativePath))
    .filter((fileName) => fileName.endsWith('.svg'))
    .map((fileName) => fileName.replace(/\.svg$/, ''))
    .sort();
}

describe('desktop icon alignment', () => {
  test('keeps generated model and provider keys aligned with raw light sources', () => {
    expect(Object.keys(MODEL_ICONS).sort()).toEqual(svgKeys('models/light'));
    expect(Object.keys(PROVIDER_ICONS).sort()).toEqual(
      [...svgKeys('providers/light'), ...Object.keys(CATALOG_ONLY_PROVIDER_ICONS)].sort(),
    );
  });

  test('uses the desktop general icon set', () => {
    expect(Object.keys(GENERAL_ICONS).sort()).toEqual(svgKeys('general'));
    expect(GENERAL_ICONS['qoder-cli']).toBeDefined();
    expect(GENERAL_ICONS).not.toHaveProperty('iflow-cli');
  });

  test('adapts the desktop virtual opencode provider to the general glyph', () => {
    expect(PROVIDER_ICONS).not.toHaveProperty('opencode');
    expect(resolveProviderIcon('opencode')).toBe(GENERAL_ICONS['open-code']);
  });
});
