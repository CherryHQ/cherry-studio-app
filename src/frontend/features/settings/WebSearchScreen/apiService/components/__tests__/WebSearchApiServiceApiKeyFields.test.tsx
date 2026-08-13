import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { WebSearchApiServiceApiKeysField } from '../WebSearchApiServiceApiKeyFields';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@cherrystudio/app-icons', () => ({
  ActivityIcon: () => null,
  KeyRoundIcon: () => null,
}));
jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    Button: (props: object) => createElement('Button', props),
    Input: (props: object) => createElement('Input', props),
    Label: (props: object) => createElement('Label', props),
    SecureInput: (props: object) => createElement('SecureInput', props),
    TextField: (props: object) => createElement('TextField', props),
  };
});

describe('WebSearchApiServiceApiKeysField', () => {
  let renderer: ReactTestRenderer | undefined;
  const onCheck = jest.fn();
  const onInputChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      renderer = create(
        <WebSearchApiServiceApiKeysField
          apiKeysInput="first-key,second-key"
          isChecking={false}
          onApiKeysInputChange={onInputChange}
          onCheck={onCheck}
          onManagePress={jest.fn()}
        />,
      );
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('checks only the first key from the current input', () => {
    const input = renderer!.root.findByType('SecureInput');
    act(() => input.props.onChangeText(' current-first \n current-second '));

    const checkButton = renderer!.root
      .findAllByType('Button')
      .find((button) => button.props.accessibilityLabel === 'settings.websearch.provider.check');
    act(() => checkButton?.props.onPress());

    expect(onInputChange).toHaveBeenCalledWith(' current-first \n current-second ');
    expect(onCheck).toHaveBeenCalledWith('current-first');
  });
});
