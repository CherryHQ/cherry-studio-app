import type { Model } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ProviderModelCheckSection } from '../ProviderModelCheckSection';

const mockSetSelectedApiKeyId = jest.fn();
const mockSetSelectedModelId = jest.fn();
const mockStartCheck = jest.fn(async () => undefined);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('lucide-uniwind/png', () => ({
  ChevronDownIcon: () => null,
}));

jest.mock('@/frontend/components/selectionSheet', () => {
  const { createElement } = jest.requireActual('react');
  return {
    SingleSelectionSheet: (props: object) => createElement('SingleSelectionSheet', props),
  };
});

jest.mock('../ProviderModelSelectSheet', () => {
  const { createElement } = jest.requireActual('react');
  return {
    ProviderModelSelectSheet: (props: object) => createElement('ProviderModelSelectSheet', props),
  };
});

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  const Button = (props: object) => createElement('Button', props);
  const Section = (props: object) => createElement('Section', props);
  Section.Header = (props: object) => createElement('SectionHeader', props);
  Section.Item = (props: object) => createElement('SectionItem', props);
  return { Button, Section };
});

const mockModel = { id: 'provider-1::model-1', name: 'Model One' } as unknown as Model;
const mockProvider = { id: 'provider-1', name: 'Provider One' } as unknown as Provider;

jest.mock('../../hooks/useProviderModelCheck', () => ({
  useProviderModelCheck: () => ({
    apiKeyOptions: [{ label: 'Default configuration', value: '__default__' }],
    isChecking: false,
    modelStatus: null,
    selectedApiKey: { label: 'Default configuration', value: '__default__' },
    selectedModel: mockModel,
    setSelectedApiKeyId: mockSetSelectedApiKeyId,
    setSelectedModelId: mockSetSelectedModelId,
    startCheck: mockStartCheck,
  }),
}));

describe('ProviderModelCheckSection', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      renderer = create(
        <ProviderModelCheckSection
          apiKeys={[]}
          models={[mockModel]}
          provider={mockProvider}
          providerId="provider-1"
        />,
      );
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  // The model row opens the picker that draws models the way the provider's own
  // model tab does; the API key row still opens the plain option list.
  test('opens model and API key selection sheets from the configuration tab', () => {
    const rows = renderer!.root.findAllByType('SectionItem');
    const apiKeySheet = renderer!.root.findByType('SingleSelectionSheet');

    expect(renderer!.root.findByType('ProviderModelSelectSheet').props.isOpen).toBe(false);
    expect(apiKeySheet.props.isOpen).toBe(false);
    expect(apiKeySheet.props.heightFraction).toBe(0.6);

    act(() => rows[0].props.onPress());
    const modelSheet = renderer!.root.findByType('ProviderModelSelectSheet');
    expect(modelSheet.props.isOpen).toBe(true);
    expect(modelSheet.props.models).toEqual([mockModel]);

    act(() => modelSheet.props.onSelect(mockModel.id));
    expect(mockSetSelectedModelId).toHaveBeenCalledWith(mockModel.id);
  });

  test('starts the check without leaving the configuration tab', async () => {
    const button = renderer!.root.findByType('Button');

    await act(async () => button.props.onPress());

    expect(mockStartCheck).toHaveBeenCalledTimes(1);
  });
});
