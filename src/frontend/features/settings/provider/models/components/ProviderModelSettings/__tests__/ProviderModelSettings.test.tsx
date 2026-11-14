import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PolicyScope } from '@/frontend/components/Policy';
import { managedResourcePolicy, OPEN_POLICY } from '@/shared/data/managedPolicy';

import { ProviderModelSettings } from '../ProviderModelSettings';
import type { ProviderModelSettingsValue } from '../types';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('react-native-keyboard-controller', () => ({ KeyboardAvoidingView: () => null }));
jest.mock('@cherrystudio/app-icons/icons/lock', () => () => null);
jest.mock('../../../../components/ProviderValueSheet', () => ({ ProviderValueSheet: () => null }));
jest.mock('../../ProviderModelPricingEditor', () => ({ ProviderModelPricingEditor: () => null }));
jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  const element = (type: string) => (props: object) => createElement(type, props);
  return {
    BottomSheet: element('BottomSheet'),
    Button: element('Button'),
    Chip: { Tag: element('Tag'), Label: element('Label') },
    OptionPickerBottomSheet: element('OptionPickerBottomSheet'),
    Section: Object.assign(element('Section'), {
      Item: element('SectionItem'),
      SelectItem: element('SectionSelectItem'),
      SwitchItem: element('SectionSwitchItem'),
    }),
    useToast: () => ({ toast: { show: jest.fn() } }),
  };
});

const value: ProviderModelSettingsValue = {
  actions: {
    rename: jest.fn(),
    setCapability: jest.fn(),
    setEndpoint: jest.fn(),
    setGroup: jest.fn(),
    setLimit: jest.fn(),
    setNotes: jest.fn(),
    setPricing: jest.fn(),
    setPrimaryType: jest.fn(),
    setSupportsStreaming: jest.fn(),
  },
  capabilities: {
    audio: false,
    drawing: false,
    embedding: false,
    functionCall: true,
    reasoning: true,
    rerank: false,
    speech: false,
    transcription: false,
    video: false,
    vision: false,
  },
  disabled: false,
  endpoint: { label: 'Chat', options: [], value: 'openai-chat-completions' as never },
  group: { value: 'Agent' },
  limits: {
    contextWindow: { value: '' },
    maxInputTokens: { value: '' },
    maxOutputTokens: { value: '' },
  },
  modelId: 'agent/deepseek-v4-flash',
  name: { required: true, value: 'DeepSeek' },
  notes: { value: '' },
  primaryType: 'text',
  pricing: { currency: 'USD', tiers: [] } as never,
  requiresImageInput: false,
  supportsStreaming: true,
};

let renderer: ReactTestRenderer;
afterEach(() => act(() => renderer.unmount()));

function render(policy: Parameters<typeof PolicyScope>[0]['policy']) {
  act(() => {
    renderer = create(
      <PolicyScope policy={policy}>
        <ProviderModelSettings value={value} />
      </PolicyScope>,
    );
  });
  return {
    pressable: renderer.root
      .findAll((node) => typeof node.type === 'string' && typeof node.props.onPress === 'function')
      .map((node) => node.props.label as string),
    selects: renderer.root.findAllByType('SectionSelectItem' as never),
    switches: renderer.root.findAllByType('SectionSwitchItem' as never),
  };
}

describe('ProviderModelSettings', () => {
  test('opens every editor for a user-owned model', () => {
    const { pressable, selects } = render(OPEN_POLICY);

    expect(pressable).toContain('settings.provider.models.detail.name');
    expect(selects).toHaveLength(2);
    expect(selects.every((row) => row.props.locked === undefined)).toBe(true);
  });

  // The locked group around an organization's model locks its editing rows; only the ID copy,
  // which changes nothing, opts out.
  test("locks an organization's choices and keeps the ID copy live", () => {
    const { selects } = render(managedResourcePolicy({ isManaged: true }));
    const modelIdRow = renderer.root.find(
      (node) => node.props.testID === 'model-setting-modelId' && typeof node.type === 'string',
    );

    expect(selects).toHaveLength(2);
    expect(selects.every((row) => row.props.locked === true)).toBe(true);
    expect(modelIdRow.props.locked).toBe(false);
  });
});
