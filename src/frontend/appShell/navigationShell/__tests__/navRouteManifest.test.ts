import fs from 'node:fs';
import path from 'node:path';

import enUS from '@/frontend/i18n/locales/en-us.json';
import { NAVIGATION_PINNABLE_TAB_IDS } from '@/shared/data/preference/preferenceSchema';

import {
  getNavHref,
  getNavStackRoute,
  getNavTitleKey,
  NAV_DESTINATION_IDS,
} from '../navRouteManifest';

const repoRoot = path.resolve(__dirname, '../../../../..');
const mainRouteDir = path.join(repoRoot, 'src/app/(drawer)/(main)');
const mainLayoutPath = path.join(mainRouteDir, '_layout.tsx');

describe('NAV_ROUTE_MANIFEST contract', () => {
  it('covers chat, more, settings, and every pinnable module with unique stack routes and hrefs', () => {
    const expectedIds = new Set(['chat', ...NAVIGATION_PINNABLE_TAB_IDS, 'more', 'settings']);
    expect(new Set(NAV_DESTINATION_IDS)).toEqual(expectedIds);

    const stackRoutes = NAV_DESTINATION_IDS.map((id) => getNavStackRoute(id));
    const hrefs = NAV_DESTINATION_IDS.map((id) => getNavHref(id));

    expect(new Set(stackRoutes).size).toBe(NAV_DESTINATION_IDS.length);
    expect(new Set(hrefs).size).toBe(NAV_DESTINATION_IDS.length);
  });

  it('points every manifest stackRoute to an existing Expo Router entry under (main)', () => {
    for (const id of NAV_DESTINATION_IDS) {
      const stackRoute = getNavStackRoute(id);
      const asDirectory = path.join(mainRouteDir, stackRoute);
      const asFile = path.join(mainRouteDir, `${stackRoute}.tsx`);
      expect(fs.existsSync(asDirectory) || fs.existsSync(asFile)).toBe(true);
    }
  });

  it('mounts every manifest destination inside (drawer)/(main)/_layout.tsx', () => {
    const layoutSource = fs.readFileSync(mainLayoutPath, 'utf8');
    for (const id of NAV_DESTINATION_IDS) {
      expect(layoutSource).toContain(`NAV_ROUTE_MANIFEST.${id}.stackRoute`);
    }
  });

  it('references valid non-empty i18n title keys in en-US', () => {
    const catalog = enUS as Record<string, string>;
    for (const id of NAV_DESTINATION_IDS) {
      const key = getNavTitleKey(id);
      expect(typeof catalog[key]).toBe('string');
      expect(catalog[key].length).toBeGreaterThan(0);
    }
  });
});
