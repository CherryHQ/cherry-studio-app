import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Section } from '../Section';

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
      'bg-settings-grouped-surface',
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

  function textValues() {
    return renderer?.root.findAllByType(Text).map((node) => node.props.children) ?? [];
  }
});
