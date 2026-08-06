import type { Model } from '@cherrystudio/universal/data/types/model';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import ProviderModelCheckScreen from '../ProviderModelCheckScreen';

const mockSetSelectedApiKeyId = jest.fn();
const mockSetSelectedModelId = jest.fn();
const mockStartCheck = jest.fn(async () => undefined);

jest.mock('expo-router', () => ({
  Redirect: () => null,
  useLocalSearchParams: () => ({ providerId: 'provider-1', providerName: 'Provider One' }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('lucide-uniwind/png', () => ({
  ChevronRightIcon: () => null,
}));

jest.mock('@/frontend/components/headers', () => ({ BackHeader: () => null }));

jest.mock('@/frontend/components/selectionSheet', () => {
  const { createElement } = jest.requireActual('react');
  return {
    SingleSelectionSheet: (props: object) => createElement('SingleSelectionSheet', props),
  };
});

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  const Button = (props: object) => createElement('Button', props);
  const Section = (props: object) => createElement('Section', props);
  Section.Item = (props: object) => createElement('SectionItem', props);
  return { Button, Section };
});

const mockModel = { id: 'provider-1::model-1', name: 'Model One' } as unknown as Model;

jest.mock('../apiService', () => ({
  useProviderApiServiceQueries: () => ({
    apiKeys: [],
    apiKeysQuery: { isPending: false },
  }),
}));

jest.mock('../detail', () => ({
  useProviderDetailSettings: () => ({
    models: [mockModel],
    modelsQuery: { isPending: false },
    provider: { id: 'provider-1', name: 'Provider One' },
    providerQuery: { isError: false, isPending: false },
  }),
}));

jest.mock('../models/hooks/useProviderModelCheck', () => ({
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

describe('ProviderModelCheckScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      renderer = create(<ProviderModelCheckScreen />);
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('opens model and API key selection sheets from the page', () => {
    const rows = renderer!.root.findAllByType('SectionItem');
    let sheets = renderer!.root.findAllByType('SingleSelectionSheet');

    expect(sheets.map((sheet) => sheet.props.isOpen)).toEqual([false, false]);
    expect(sheets[1].props.heightFraction).toBe(0.6);

    act(() => rows[0].props.onPress());
    sheets = renderer!.root.findAllByType('SingleSelectionSheet');
    expect(sheets[0].props.isOpen).toBe(true);

    act(() => sheets[0].props.onSelect(mockModel.id));
    expect(mockSetSelectedModelId).toHaveBeenCalledWith(mockModel.id);
  });

  test('starts the check from the independent page', async () => {
    const button = renderer!.root.findByType('Button');

    await act(async () => button.props.onPress());

    expect(mockStartCheck).toHaveBeenCalledTimes(1);
  });
});
