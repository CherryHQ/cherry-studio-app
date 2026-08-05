import { useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SettingsServiceRow } from '../SettingsServiceRow';

jest.mock('lucide-uniwind/png', () => ({ ChevronRightIcon: () => null }));
jest.mock('heroui-native/utils', () => ({
  cn: (...classes: (false | null | string | undefined)[]) => classes.filter(Boolean).join(' '),
}));
jest.mock('@cherrystudio/ui/components', () => ({
  Section: jest.requireActual('../../../../../../packages/ui/src/components/section/section')
    .Section,
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

  it('keeps the separator in layout and makes it transparent while pressed', async () => {
    await act(async () => {
      renderer = create(
        <SettingsServiceRow
          id="server-1"
          isEnabled
          name="Docs server"
          onPress={jest.fn()}
          showSeparator
        />,
      );
    });

    const row = renderer?.root.find(
      (node) =>
        node.props.accessibilityRole === 'button' && typeof node.props.className === 'string',
    );
    const separator = () =>
      renderer?.root
        .findAllByProps({ testID: 'settings-grouped-separator' })
        .find((node) => typeof node.type === 'string');

    expect(separator()?.props.className).not.toContain('opacity-0');
    await act(async () => row?.props.onPressIn());
    expect(separator()?.props.className).toContain('opacity-0');
    await act(async () => row?.props.onPressOut());
    expect(separator()?.props.className).not.toContain('opacity-0');
  });

  it('makes both adjacent separators transparent while the middle row is pressed', async () => {
    function Group() {
      const [pressedId, setPressedId] = useState<string>();
      const rows = ['first', 'middle', 'last'];

      return rows.map((id, index) => {
        const previousId = rows[index - 1];
        return (
          <SettingsServiceRow
            hideSeparator={pressedId === id || pressedId === previousId}
            id={id}
            isEnabled
            key={id}
            name={id}
            onPress={jest.fn()}
            onPressedChange={(nextId, isPressed) =>
              setPressedId((currentId) =>
                isPressed ? nextId : currentId === nextId ? undefined : currentId,
              )
            }
            showSeparator={index > 0}
          />
        );
      });
    }

    await act(async () => {
      renderer = create(<Group />);
    });

    const middleRow = renderer?.root.find(
      (node) =>
        node.props.accessibilityLabel === 'middle' && typeof node.props.className === 'string',
    );
    const separators = () =>
      renderer?.root
        .findAllByProps({ testID: 'settings-grouped-separator' })
        .filter((node) => typeof node.type === 'string') ?? [];

    expect(separators()).toHaveLength(2);
    expect(
      separators().every((separator) => !separator.props.className.includes('opacity-0')),
    ).toBe(true);
    await act(async () => middleRow?.props.onPressIn());
    expect(separators().every((separator) => separator.props.className.includes('opacity-0'))).toBe(
      true,
    );
    await act(async () => middleRow?.props.onPressOut());
    expect(
      separators().every((separator) => !separator.props.className.includes('opacity-0')),
    ).toBe(true);
  });
});
