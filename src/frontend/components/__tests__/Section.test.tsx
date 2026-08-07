import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Section, SectionIcon, SectionImage } from '../Section';

const mockPress = jest.fn();

jest.mock('lucide-uniwind/png', () => ({ ChevronRightIcon: () => null }));
jest.mock('@/frontend/components/nativePrimitives', () => ({ Image: () => null }));

describe('Section', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    jest.clearAllMocks();
  });

  test('renders a shared header, action, and item surface', async () => {
    await act(async () => {
      renderer = create(
        <Section
          action={<Text>Action</Text>}
          items={[{ id: 'one', onPress: mockPress, title: 'First item' }]}
          subtitle="Subtitle"
          testID="section"
          title="Title"
        />,
      );
    });

    expect(textValues()).toEqual(
      expect.arrayContaining(['Title', 'Subtitle', 'Action', 'First item']),
    );
    const item = renderer?.root
      .findAllByProps({ accessibilityLabel: 'First item' })
      .find((node) => typeof node.props.onPress === 'function');
    await act(async () => item?.props.onPress());
    expect(mockPress).toHaveBeenCalledTimes(1);
    expect(renderer?.root.findByProps({ testID: 'section-content' }).props.className).toContain(
      'bg-grouped-surface',
    );
  });

  test('accepts custom section content', async () => {
    await act(async () => {
      renderer = create(
        <Section contentClassName="p-4" testID="custom-section" title="Custom">
          <Text>Chart content</Text>
        </Section>,
      );
    });

    expect(textValues()).toEqual(expect.arrayContaining(['Custom', 'Chart content']));
    expect(
      renderer?.root.findByProps({ testID: 'custom-section-content' }).props.className,
    ).toContain('p-4');
  });

  test('renders the leading slot verbatim', async () => {
    await act(async () => {
      renderer = create(
        <Section
          items={[
            {
              leading: <Text className="min-w-6 text-center text-emoji-xl">{'\u{1F3A8}'}</Text>,
              title: 'Appearance',
            },
          ]}
        />,
      );
    });

    expect(renderer?.root.findByProps({ children: '\u{1F3A8}' }).props.className).toBe(
      'min-w-6 text-center text-emoji-xl',
    );
  });

  test('gives the leading helpers the shared row sizing', async () => {
    const StubIcon = (props: Record<string, unknown>) => <Text {...props}>{'stub'}</Text>;

    await act(async () => {
      renderer = create(<SectionIcon icon={StubIcon} />);
    });

    expect(renderer?.root.findByProps({ children: 'stub' }).props.className).toBe(
      'size-6 text-default-foreground',
    );
  });

  test('renders nothing when a leading helper has no source', async () => {
    // PermissionsScreen and friends pass a possibly-absent icon straight through.
    await act(async () => {
      renderer = create(
        <>
          <SectionIcon />
          <SectionImage />
        </>,
      );
    });

    expect(renderer?.toJSON()).toBeNull();
  });

  function textValues() {
    return renderer?.root.findAllByType(Text).map((node) => node.props.children) ?? [];
  }
});
