import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { agentPolicy, managedResourcePolicy } from '@/shared/data/managedPolicy';

import {
  ManagedMark,
  PolicyDeletable,
  PolicyEditable,
  PolicyGroup,
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
  function MockSelectItem({
    label,
    locked,
    value,
  }: {
    label: string;
    locked?: boolean;
    value: ReactNode;
  }) {
    return (
      <MockView testID={locked ? 'locked-select-item' : 'section-select-item'}>
        <MockText>{label}</MockText>
        {typeof value === 'string' ? <MockText>{value}</MockText> : value}
      </MockView>
    );
  }
  return {
    LockedGroup: ({ children }: { children: ReactNode }) => (
      <MockView testID="locked-group">{children}</MockView>
    ),
    LockedMark: () => <MockView testID="managed-mark" />,
    Section: { SelectItem: MockSelectItem },
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
        <ManagedMark />
        <PolicyGroup>
          <Text>owned</Text>
        </PolicyGroup>
      </>,
    );
    expect(texts()).toEqual(['edit', 'secret', 'delete', 'owned']);
    expect(rows('managed-mark')).toHaveLength(0);
    expect(rows('locked-group')).toHaveLength(0);
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
        <ManagedMark />
        <PolicyGroup>
          <Text>owned</Text>
        </PolicyGroup>
      </PolicyScope>,
    );
    expect(texts()).toEqual(['read', 'edit mode', 'owned']);
    expect(rows('managed-mark')).toHaveLength(1);
    expect(rows('locked-group')).toHaveLength(1);
  });

  test('locks a selection row once its field is locked, and keeps it a Section row', () => {
    const row = (policy: ReturnType<typeof agentPolicy>, empty = false) => (
      <PolicyScope policy={policy}>
        <PolicySelectItem
          empty={empty}
          field="model"
          label="Model"
          onPress={jest.fn()}
          value="One"
        />
      </PolicyScope>
    );
    render(row(managedAgent));
    expect(rows('section-select-item')).toHaveLength(1);
    act(() => renderer.update(row(singleModelAgent)));
    expect(rows('locked-select-item')).toHaveLength(1);
    expect(texts()).toEqual(['Model', 'One']);
    // An empty locked choice says so instead of inviting a pick.
    act(() => renderer.update(row(singleModelAgent, true)));
    expect(texts()).toEqual(['Model', 'settings.provider.config.notSet']);
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
    expect(seen[1]).toBe('Search, enterprise.managed.label');
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
