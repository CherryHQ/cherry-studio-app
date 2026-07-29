import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SettingsServiceRow } from '../SettingsServiceRow';

jest.mock('lucide-uniwind/png', () => ({ ChevronRightIcon: () => null }));
jest.mock('heroui-native/utils', () => ({
  cn: (...classes: (false | null | string | undefined)[]) => classes.filter(Boolean).join(' '),
}));

describe('SettingsServiceRow', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('combines the name, status, and subtitle in its accessibility label', async () => {
    await act(async () => {
      renderer = create(
        <SettingsServiceRow
          id="server-1"
          isEnabled
          name="Docs server"
          onPress={jest.fn()}
          statusLabel="Connected"
          subtitle="3 tools"
        />,
      );
    });

    expect(
      renderer?.root.findByProps({ accessibilityRole: 'button' }).props.accessibilityLabel,
    ).toBe('Docs server, Connected, 3 tools');
  });

  it.each([
    ['renders', true],
    ['omits', false],
  ])('%s the separator when showSeparator is %s', async (_label, showSeparator) => {
    await act(async () => {
      renderer = create(
        <SettingsServiceRow
          id="server-1"
          isEnabled
          name="Docs server"
          onPress={jest.fn()}
          showSeparator={showSeparator}
        />,
      );
    });

    const separators =
      renderer?.root
        .findAllByProps({ testID: 'settings-grouped-separator' })
        .filter((node) => typeof node.type === 'string') ?? [];

    expect(separators).toHaveLength(showSeparator ? 1 : 0);
  });
});
