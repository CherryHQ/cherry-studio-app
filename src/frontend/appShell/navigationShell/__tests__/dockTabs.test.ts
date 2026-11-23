import {
  canPinTab,
  canUnpinTab,
  DEFAULT_PINNED_TABS,
  isRootNavPathname,
  isUnpinnedModuleRoot,
  normalizePinnedTabs,
  pinTab,
  reorderPinnedTab,
  resolveActiveDockTab,
  resolveCompactLeadingAction,
  resolveDockTabs,
  resolveMoreModules,
  resolveNavDestination,
  unpinTab,
} from '../dockTabs';

describe('dockTabs', () => {
  test('normalizes invalid, duplicate, missing agents, and over-limit tabs', () => {
    expect(normalizePinnedTabs(undefined)).toEqual(['agents']);
    expect(normalizePinnedTabs([])).toEqual(['agents']);
    expect(normalizePinnedTabs(['chat' as never, 'more' as never, 'unknown' as never])).toEqual([
      'agents',
    ]);
    expect(
      normalizePinnedTabs(['drawings', 'agents', 'drawings', 'files', 'plugins', 'marketplace']),
    ).toEqual(['drawings', 'agents', 'files']);
  });

  test('resolves 3 to 5 dock tabs and mutually exclusive More modules', () => {
    expect(resolveDockTabs(DEFAULT_PINNED_TABS)).toEqual(['chat', 'agents', 'more']);
    expect(resolveMoreModules(DEFAULT_PINNED_TABS)).toEqual([
      'drawings',
      'plugins',
      'marketplace',
      'files',
      'devices',
    ]);

    const five = pinTab(pinTab(DEFAULT_PINNED_TABS, 'drawings'), 'files');
    expect(five).toEqual(['agents', 'drawings', 'files']);
    expect(resolveDockTabs(five)).toEqual(['chat', 'agents', 'drawings', 'files', 'more']);
    expect(resolveMoreModules(five)).toEqual(['plugins', 'marketplace', 'devices']);
    expect(canPinTab(five, 'plugins')).toBe(false);
    expect(pinTab(five, 'plugins')).toEqual(five);
  });

  test('keeps agents non-removable while allowing unpin and reorder of other modules', () => {
    expect(canUnpinTab(['agents', 'drawings'], 'agents')).toBe(false);
    expect(canUnpinTab(['agents', 'drawings'], 'drawings')).toBe(true);
    expect(unpinTab(['agents', 'drawings'], 'agents')).toEqual(['agents', 'drawings']);
    expect(unpinTab(['agents', 'drawings'], 'drawings')).toEqual(['agents']);

    expect(reorderPinnedTab(['agents', 'drawings', 'files'], 'drawings', 0)).toEqual([
      'drawings',
      'agents',
      'files',
    ]);
    expect(pinTab(['agents', 'files'], 'drawings', 1)).toEqual(['agents', 'drawings', 'files']);
  });

  test('resolves pathnames, active dock tab, and compact leading action', () => {
    expect(resolveNavDestination('/')).toBe('chat');
    expect(resolveNavDestination('/skills/abc')).toBe('marketplace');
    expect(resolveNavDestination('/paintings/123')).toBe('drawings');
    expect(resolveNavDestination('/devices/pc-1')).toBe('devices');
    expect(resolveNavDestination('/more')).toBe('more');

    expect(isRootNavPathname('/')).toBe(true);
    expect(isRootNavPathname('/more')).toBe(true);
    expect(isRootNavPathname('/agents')).toBe(true);
    expect(isRootNavPathname('/agents/1/edit')).toBe(false);
    expect(isRootNavPathname('/settings')).toBe(false);

    expect(resolveActiveDockTab('drawings', ['agents'])).toBe('more');
    expect(resolveActiveDockTab('drawings', ['agents', 'drawings'])).toBe('drawings');
    expect(resolveActiveDockTab('settings', ['agents'])).toBeUndefined();

    expect(isUnpinnedModuleRoot('/drawings', ['agents'])).toBe(true);
    expect(isUnpinnedModuleRoot('/drawings', ['agents', 'drawings'])).toBe(false);
    expect(isUnpinnedModuleRoot('/more', ['agents'])).toBe(false);

    expect(resolveCompactLeadingAction('/', ['agents'])).toBe('drawer');
    expect(resolveCompactLeadingAction('/agents', ['agents'])).toBe('drawer');
    expect(resolveCompactLeadingAction('/more', ['agents'])).toBe('drawer');
    expect(resolveCompactLeadingAction('/drawings', ['agents'])).toBe('back');
    expect(resolveCompactLeadingAction('/drawings', ['agents', 'drawings'])).toBe('drawer');
    expect(resolveCompactLeadingAction('/agents/new', ['agents'])).toBe('back');
  });
});
