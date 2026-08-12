import type { Model } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ProviderModelRow } from '../ProviderModelRow';

jest.mock('@/frontend/components/ModelAvatar', () => {
  const { createElement } = jest.requireActual('react');
  return { ModelAvatar: (props: object) => createElement('ModelAvatar', props) };
});

jest.mock('@/frontend/components/modelPicker', () => {
  const { createElement } = jest.requireActual('react');
  return {
    getModelPickerTags: (model: { capabilities?: string[] }) => model.capabilities ?? [],
    isFreeModel: () => false,
    ModelPickerTagChip: (props: object) => createElement('ModelPickerTagChip', props),
  };
});

jest.mock('lucide-uniwind/png', () => {
  const { createElement } = jest.requireActual('react');
  return { CheckIcon: (props: object) => createElement('CheckIcon', props) };
});

function model(capabilities: string[]): Model {
  return {
    capabilities,
    id: 'provider-1::model-1',
    modelId: 'model-1',
    name: 'Model One',
  } as unknown as Model;
}

const provider = { id: 'provider-1', name: 'Provider One' } as unknown as Provider;

describe('ProviderModelRow', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  function render(node: React.ReactElement) {
    act(() => {
      renderer = create(node);
    });

    return renderer!;
  }

  // One line: avatar, name, capabilities and the caller's action, in that order.
  it('draws the capabilities and the action on the name’s own line', () => {
    const { createElement } = jest.requireActual('react');
    const tree = render(
      <ProviderModelRow model={model(['reasoning', 'web-search'])} provider={provider}>
        {createElement('RemoveButton')}
      </ProviderModelRow>,
    );

    expect(tree.root.findAllByType('ModelPickerTagChip')).toHaveLength(2);
    expect(tree.root.findAllByType('RemoveButton')).toHaveLength(1);
  });

  it('renders no chips for a model with no capabilities', () => {
    const tree = render(<ProviderModelRow model={model([])} provider={provider} />);

    expect(tree.root.findAllByType('ModelPickerTagChip')).toHaveLength(0);
  });

  // The name is the only part that gives, so it has to ellipsize rather than
  // wrap — a wrapped name would make the row taller than the list estimates.
  it('ellipsizes the model name', () => {
    const tree = render(<ProviderModelRow model={model(['reasoning'])} provider={provider} />);
    const name = tree.root.findByType('Text');

    expect(name.props.numberOfLines).toBe(1);
    expect(name.props.children).toBe('Model One');
  });

  it('strikes through a model the provider no longer serves', () => {
    const tree = render(<ProviderModelRow model={model([])} provider={provider} tone="struck" />);

    expect(tree.root.findByType('Text').props.className).toContain('line-through');
  });

  // The pull screen tints an applied row, and the row has no wrapper of its own
  // left to hang that on.
  it('merges the caller’s class into the row', () => {
    const tree = render(
      <ProviderModelRow className="bg-success/10" model={model([])} provider={provider} />,
    );

    expect(tree.root.findByType('View').props.className).toContain('bg-success/10');
  });

  describe('while selecting', () => {
    // The `Pressable` element itself, rather than the host view it renders —
    // only the former carries `onPress`.
    function findCheckbox(tree: ReactTestRenderer) {
      return tree.root.findAllByProps({ accessibilityRole: 'checkbox' })[0];
    }

    function findTickClassNames(tree: ReactTestRenderer) {
      return tree.root
        .findAll(
          (node) =>
            typeof node.type === 'string' &&
            typeof node.props.className === 'string' &&
            node.props.className.includes('size-6'),
        )
        .map((node) => node.props.className as string);
    }

    it('makes the whole row the control that ticks the checkbox', () => {
      const onToggle = jest.fn();
      const tree = render(
        <ProviderModelRow
          model={model([])}
          provider={provider}
          selection={{ isSelected: false, onToggle }}
        />,
      );
      const row = findCheckbox(tree);

      expect(row.props.accessibilityState).toMatchObject({ checked: false });

      act(() => row.props.onPress());

      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('fills the checkbox for a selected model', () => {
      const tree = render(
        <ProviderModelRow
          model={model([])}
          provider={provider}
          selection={{ isSelected: true, onToggle: jest.fn() }}
        />,
      );

      expect(findCheckbox(tree).props.accessibilityState.checked).toBe(true);
      expect(findTickClassNames(tree)[0]).toContain('bg-primary');
    });

    it('leaves the checkbox empty for an unselected model', () => {
      const tree = render(
        <ProviderModelRow
          model={model([])}
          provider={provider}
          selection={{ isSelected: false, onToggle: jest.fn() }}
        />,
      );

      expect(findTickClassNames(tree)[0]).toContain('border-border-strong');
    });

    // The chat default cannot be removed, so ticking it would only lead to a
    // delete that skips it.
    it('leaves a model that cannot be removed untickable', () => {
      const tree = render(
        <ProviderModelRow
          model={model([])}
          provider={provider}
          selection={{ isDisabled: true, isSelected: false, onToggle: jest.fn() }}
        />,
      );

      expect(findCheckbox(tree).props.disabled).toBe(true);
    });

    it('draws no checkbox at all outside a selection', () => {
      const tree = render(<ProviderModelRow model={model([])} provider={provider} />);

      expect(tree.root.findAllByProps({ accessibilityRole: 'checkbox' })).toHaveLength(0);
      expect(findTickClassNames(tree)).toHaveLength(0);
    });
  });
});
