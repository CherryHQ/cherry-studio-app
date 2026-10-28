import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { agentPolicy, managedResourcePolicy } from '@/shared/data/managedPolicy';

import {
  ManagedBadge,
  PolicyDeletable,
  PolicyEditable,
  PolicyScope,
  PolicySecret,
  PolicySelectItem,
  useManagedLabel,
  useModelChoice,
  usePermittedItems,
  withPolicy,
} from '..';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@cherrystudio/app-icons/icons/lock', () => () => null);
jest.mock('@cherrystudio/ui/components', () => {
  const { Text: MockText, View: MockView } = jest.requireActual('react-native');
  const row = (testID: string) =>
    function MockRow({ label, trailing }: { label: string; trailing?: ReactNode }) {
      return (
        <MockView testID={testID}>
          <MockText>{label}</MockText>
          {trailing}
        </MockView>
      );
    };
  return {
    Chip: { Tag: () => <MockView testID="managed-badge" />, Label: () => null },
    Section: { Item: row('section-item'), SelectItem: row('section-select-item') },
  };
});

const managedAgent = agentPolicy({ isManaged: true, allowedModelIds: ['a::one', 'b::two'] });
const singleModelAgent = agentPolicy({ isManaged: true, allowedModelIds: ['a::one'] });

let renderer: ReactTestRenderer;
function render(node: ReactNode) {
  act(() => {
    renderer = create(<>{node}</>);
  });
  return renderer;
}
const texts = () => renderer.root.findAllByType(Text).map((node) => node.props.children);
const rows = (testID: string) =>
  renderer.root.findAll((node) => node.props?.testID === testID && typeof node.type === 'string');

afterEach(() => act(() => renderer.unmount()));

describe('Policy', () => {
  test('leaves everything open without a scope', () => {
    render(
      <>
        <PolicyEditable field="name" fallback={<Text>read</Text>}>
          <Text>edit</Text>
        </PolicyEditable>
        <PolicySecret>
          <Text>secret</Text>
        </PolicySecret>
        <PolicyDeletable>
          <Text>delete</Text>
        </PolicyDeletable>
        <ManagedBadge />
      </>,
    );
    expect(texts()).toEqual(['edit', 'secret', 'delete']);
    expect(rows('managed-badge')).toHaveLength(0);
  });

  test('applies a managed Agent policy through standard props', () => {
    render(
      <PolicyScope policy={managedAgent}>
        <PolicyEditable field="name" fallback={<Text>read</Text>}>
          <Text>edit</Text>
        </PolicyEditable>
        <PolicyEditable field="mode" fallback={<Text>read mode</Text>}>
          <Text>edit mode</Text>
        </PolicyEditable>
        <PolicySecret>
          <Text>secret</Text>
        </PolicySecret>
        <PolicyDeletable>
          <Text>delete</Text>
        </PolicyDeletable>
        <ManagedBadge />
      </PolicyScope>,
    );
    expect(texts()).toEqual(['read', 'edit mode']);
    expect(rows('managed-badge')).toHaveLength(1);
  });

  test('shows a selection row read-only once its field is locked, and stays a Section row', () => {
    const row = (policy: ReturnType<typeof agentPolicy>) => (
      <PolicyScope policy={policy}>
        <PolicySelectItem field="model" label="Model" onPress={jest.fn()} value="One" />
      </PolicyScope>
    );
    render(row(managedAgent));
    expect(rows('section-select-item')).toHaveLength(1);
    act(() => renderer.update(row(singleModelAgent)));
    expect(rows('section-select-item')).toHaveLength(0);
    expect(rows('section-item')).toHaveLength(1);
    expect(texts()).toEqual(['Model', 'One']);
    expect(PolicySelectItem.sectionItem).toBe(true);
  });

  test('derives model choice, labels and permitted menu items from the scope', () => {
    const seen: unknown[] = [];
    function Probe() {
      seen.push(
        useModelChoice(),
        useManagedLabel('Search'),
        usePermittedItems([
          { id: 'source' },
          { id: 'update', requires: 'change' as const },
          { id: 'remove', requires: 'delete' as const },
        ]).map(({ id }) => id),
      );
      return null;
    }
    render(
      <PolicyScope policy={singleModelAgent}>
        <Probe />
      </PolicyScope>,
    );
    expect(seen[0]).toMatchObject({ isLocked: true });
    expect(seen[1]).toBe('Search, enterprise.managed.badge');
    expect(seen[2]).toEqual(['source']);

    seen.length = 0;
    act(() =>
      renderer.update(
        <PolicyScope policy={managedResourcePolicy({})}>
          <Probe />
        </PolicyScope>,
      ),
    );
    expect(seen[0]).toMatchObject({ allowedModelIds: null, isLocked: false });
    expect(seen[2]).toEqual(['source', 'update', 'remove']);
  });

  test('withPolicy overrides props or renders nothing', () => {
    const Label = withPolicy(
      ({ text }: { text: string }) => <Text>{text}</Text>,
      (policy, { text }) => (policy.canDelete ? { text: `${text}!` } : null),
    );
    render(
      <>
        <Label text="open" />
        <PolicyScope policy={managedAgent}>
          <Label text="locked" />
        </PolicyScope>
      </>,
    );
    expect(texts()).toEqual(['open!']);
  });
});
