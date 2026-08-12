import type { Model } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { getProviderModelRowItemType, ProviderModelRow } from '../ProviderModelRow';

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  const Section = (props: object) => createElement('Section', props);
  // The real item renders its slots; the stub has to as well, or nothing handed
  // to `description`/`trailing` would ever appear in the tree.
  Section.Item = (props: {
    description?: unknown;
    label?: unknown;
    leading?: unknown;
    trailing?: unknown;
  }) =>
    createElement(
      'SectionItem',
      props,
      props.leading,
      props.label,
      props.description,
      props.trailing,
    );
  return { Section };
});

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

jest.mock('../../../../components/SettingsGroupedSurface', () => {
  const { createElement } = jest.requireActual('react');
  return {
    SettingsGroupedSurface: ({ children, ...props }: { children?: unknown }) =>
      createElement('SettingsGroupedSurface', props, children),
  };
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

  // Capabilities used to share the trailing slot with the action button, which
  // squeezed the name off the row once a model had a few of them.
  it('puts the capability chips on their own line, below the name', () => {
    const tree = render(
      <ProviderModelRow
        isFirst
        isLast
        model={model(['reasoning', 'web-search'])}
        provider={provider}
      />,
    );

    const row = tree.root.findByType('SectionItem');

    expect(row.props.label).toBe('Model One');
    expect(row.props.description).toBeDefined();
    expect(tree.root.findAllByType('ModelPickerTagChip')).toHaveLength(2);
  });

  it('drops the second line for a model with nothing to show there', () => {
    const tree = render(<ProviderModelRow isFirst isLast model={model([])} provider={provider} />);

    expect(tree.root.findByType('SectionItem').props.description).toBeUndefined();
    expect(tree.root.findAllByType('ModelPickerTagChip')).toHaveLength(0);
  });

  it('leaves the trailing slot empty when the caller has no action for it', () => {
    const tree = render(
      <ProviderModelRow isFirst isLast model={model(['reasoning'])} provider={provider} />,
    );

    expect(tree.root.findByType('SectionItem').props.trailing).toBeUndefined();
  });

  it('hands the trailing slot straight to the caller', () => {
    const { createElement } = jest.requireActual('react');
    const tree = render(
      <ProviderModelRow isFirst isLast model={model([])} provider={provider}>
        {createElement('RemoveButton')}
      </ProviderModelRow>,
    );

    expect(tree.root.findAllByType('RemoveButton')).toHaveLength(1);
  });

  // The lists mix one- and two-line rows, so their virtualizer sizes by type.
  it('reports which of the two heights a model takes', () => {
    expect(getProviderModelRowItemType(model(['reasoning']))).toBe('capabilities');
    expect(getProviderModelRowItemType(model([]))).toBe('compact');
  });
});
